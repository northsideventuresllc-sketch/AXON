import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { sendAccountLockedEmail } from '@/lib/axon-security-email';
import { getSecurityQuestionById } from '@/lib/axon-security-questions';
import {
  DEFAULT_OPERATOR_ID,
  MASTER_DISPLAY_NAME,
  MASTER_PASSCODE,
  RECOVERY_TOKEN_TTL_HOURS,
  type AuthRecordView,
  type AuthStatus,
  type AxonPasskeyRow,
  type AxonSecurityAnswerRow,
  type AxonSecurityTokenRow,
  type AxonUserSecurity,
  type FailedAttemptResult,
  type LockoutPhase,
  type LockoutState,
  type VerifyPasscodeResult,
} from '@/lib/axon-security-types';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function scryptAsync(password: string | Buffer, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Phase 0: 7 tries → 10 min. Phase 1–3: 2 tries each → escalating lockout. Phase 4: until recovery. */
export const LOCKOUT_PHASE_CONFIG: Record<
  LockoutPhase,
  { maxTries: number; lockoutMs: number | null; nextPhase: LockoutPhase | null }
> = {
  0: { maxTries: 7, lockoutMs: 10 * 60 * 1000, nextPhase: 1 },
  1: { maxTries: 2, lockoutMs: 60 * 60 * 1000, nextPhase: 2 },
  2: { maxTries: 2, lockoutMs: 6 * 60 * 60 * 1000, nextPhase: 3 },
  3: { maxTries: 2, lockoutMs: null, nextPhase: 4 },
  4: { maxTries: 0, lockoutMs: null, nextPhase: null },
};

export const SECURITY_QUESTIONS_GRACE_DAYS = 7;
export const SECURITY_QUESTIONS_CHANGE_COOLDOWN_DAYS = 30;
export const PERIODIC_SECURITY_VERIFY_DAYS = 60;

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

function getSupabaseKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function getSecurityClient(): SupabaseClient {
  return createSupabaseClient(getSupabaseKey());
}

function db(): SupabaseClient {
  return getSecurityClient();
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function deriveScryptHash(secret: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(secret, salt, SCRYPT_KEYLEN);
}

/** Hash passcode with scrypt (`saltHex.hashHex`). */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveScryptHash(passcode, salt);
  return `${salt.toString('hex')}.${hash.toString('hex')}`;
}

/** Verify stored passcode hash (scrypt). */
export async function verifyPasscodeHash(passcode: string, stored: string): Promise<boolean> {
  if (stored.includes('.')) {
    const [saltHex, hashHex] = stored.split('.');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const actual = await deriveScryptHash(passcode, salt);
      if (expected.length !== actual.length) return false;
      return timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  const legacy = decodeStoredHash(stored);
  if (!legacy) return false;
  const actual = await deriveScryptHash(passcode, Buffer.from(legacy.salt, 'hex'));
  try {
    const a = actual;
    const b = Buffer.from(legacy.hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Legacy sync helper for callers expecting `{ hash, salt }`. */
export function encodeStoredHash(salt: string, hash: string): string {
  return `${salt}$${hash}`;
}

export function decodeStoredHash(stored: string): { salt: string; hash: string } | null {
  const idx = stored.indexOf('$');
  if (idx <= 0) return null;
  return { salt: stored.slice(0, idx), hash: stored.slice(idx + 1) };
}

export async function hashSecurityAnswer(answer: string): Promise<string> {
  return hashPasscode(normalizeAnswer(answer));
}

export async function verifySecurityAnswer(answer: string, stored: string): Promise<boolean> {
  return verifyPasscodeHash(normalizeAnswer(answer), stored);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
}

function isLocked(user: AxonUserSecurity, now = new Date()): boolean {
  if (user.lockout_phase === 4) return true;
  if (!user.locked_until) return false;
  return new Date(user.locked_until) > now;
}

export function getLockoutState(user: AxonUserSecurity, now = new Date()): LockoutState {
  const locked = isLocked(user, now);
  return {
    locked,
    lockout_phase: user.lockout_phase,
    tries_remaining_in_phase: user.tries_remaining_in_phase,
    locked_until: user.locked_until,
    requires_security_questions: user.lockout_phase === 4,
    attemptsRemaining: user.tries_remaining_in_phase,
    failedAttempts: user.failed_attempts,
  };
}

export function mapLockoutForClient(lockout: LockoutState) {
  return {
    ...lockout,
    lockoutUntil: lockout.locked_until,
    attemptsRemaining: lockout.tries_remaining_in_phase,
    failedAttempts: lockout.failedAttempts,
  };
}

export const computeLockoutState = getLockoutState;
export const buildLockoutState = getLockoutState;

export function canChangeSecurityQuestions(user: AxonUserSecurity, now = new Date()): boolean {
  if (!user.security_questions_set_at) return true;
  const daysSinceSet = daysBetween(new Date(user.security_questions_set_at), now);
  if (daysSinceSet < SECURITY_QUESTIONS_GRACE_DAYS) return false;
  if (daysSinceSet < SECURITY_QUESTIONS_CHANGE_COOLDOWN_DAYS) return false;
  return true;
}

export function needsPeriodicSecurityVerify(user: AxonUserSecurity, now = new Date()): boolean {
  if (!user.security_questions_set_at) return false;
  if (!user.last_security_verify_at) return true;
  return daysBetween(new Date(user.last_security_verify_at), now) >= PERIODIC_SECURITY_VERIFY_DAYS;
}

export const needsSecurityVerify = needsPeriodicSecurityVerify;

export function isNewDevice(user: AxonUserSecurity, deviceId: string): boolean {
  if (!deviceId) return true;
  return !(user.device_fingerprints || []).some((d) => d.device_id === deviceId);
}

export function needsSecuritySetup(user: AxonUserSecurity): boolean {
  return !user.security_questions_set_at;
}

async function fetchUser(operatorId: string): Promise<AxonUserSecurity | null> {
  const rows = (await db().sbSelect(
    'axon_user_security',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=*&limit=1`
  )) as AxonUserSecurity[];
  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    device_fingerprints: Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [],
  };
}

export async function getUserSecurity(operatorId = DEFAULT_OPERATOR_ID): Promise<AxonUserSecurity> {
  const row = await fetchUser(operatorId);
  if (row) return row;
  return initDefaultOperatorSecurity(operatorId);
}

export async function upsertUserSecurity(
  operatorId: string,
  patch: Partial<Omit<AxonUserSecurity, 'operator_id' | 'created_at' | 'updated_at'>>
): Promise<AxonUserSecurity> {
  const existing = await fetchUser(operatorId);
  const now = new Date().toISOString();

  if (existing) {
    const updated = (await db().sbPatch(
      'axon_user_security',
      `operator_id=eq.${encodeURIComponent(operatorId)}`,
      { ...patch, updated_at: now }
    )) as AxonUserSecurity;
    return {
      ...updated,
      device_fingerprints: Array.isArray(updated.device_fingerprints) ? updated.device_fingerprints : [],
    };
  }

  const created = (await db().sbInsert('axon_user_security', {
    operator_id: operatorId,
    passcode_hash: patch.passcode_hash ?? '',
    display_name: patch.display_name ?? operatorId,
    email: patch.email ?? null,
    lockout_phase: patch.lockout_phase ?? 0,
    failed_attempts: patch.failed_attempts ?? 0,
    locked_until: patch.locked_until ?? null,
    tries_remaining_in_phase: patch.tries_remaining_in_phase ?? LOCKOUT_PHASE_CONFIG[0].maxTries,
    security_questions_set_at: patch.security_questions_set_at ?? null,
    last_security_verify_at: patch.last_security_verify_at ?? null,
    two_fa_enabled: patch.two_fa_enabled ?? false,
    two_fa_secret: patch.two_fa_secret ?? null,
    device_fingerprints: patch.device_fingerprints ?? [],
    created_at: now,
    updated_at: now,
  })) as AxonUserSecurity;

  return {
    ...created,
    device_fingerprints: Array.isArray(created.device_fingerprints) ? created.device_fingerprints : [],
  };
}

export async function initDefaultOperatorSecurity(
  operatorId = DEFAULT_OPERATOR_ID
): Promise<AxonUserSecurity> {
  const existing = await fetchUser(operatorId);
  if (existing?.passcode_hash) return existing;

  const passcodeHash = await hashPasscode(MASTER_PASSCODE);
  return upsertUserSecurity(operatorId, {
    passcode_hash: passcodeHash,
    display_name: MASTER_DISPLAY_NAME,
    email: existing?.email ?? null,
    lockout_phase: 0,
    failed_attempts: 0,
    locked_until: null,
    tries_remaining_in_phase: LOCKOUT_PHASE_CONFIG[0].maxTries,
    two_fa_enabled: false,
    two_fa_secret: null,
    device_fingerprints: [],
  });
}

export const ensureMasterAccount = initDefaultOperatorSecurity;

export async function clearExpiredLockout(operatorId: string): Promise<AxonUserSecurity> {
  const user = await getUserSecurity(operatorId);
  if (user.lockout_phase === 4 || !user.locked_until) return user;
  if (new Date(user.locked_until) > new Date()) return user;
  return upsertUserSecurity(operatorId, { locked_until: null });
}

async function applyPhaseLockout(user: AxonUserSecurity): Promise<FailedAttemptResult> {
  const phase = user.lockout_phase;
  const config = LOCKOUT_PHASE_CONFIG[phase];
  const now = new Date();
  let nextPhase: LockoutPhase = phase;
  let lockedUntil: string | null = null;
  let triesRemaining = user.tries_remaining_in_phase;
  let emailSent = false;

  if (phase === 3) {
    nextPhase = 4;
    lockedUntil = null;
    triesRemaining = 0;
    if (user.email) {
      try {
        await sendAccountLockedEmail(user.operator_id, user.email);
        emailSent = true;
      } catch {
        /* non-blocking */
      }
    }
  } else if (config.lockoutMs != null && config.nextPhase != null) {
    lockedUntil = new Date(now.getTime() + config.lockoutMs).toISOString();
    nextPhase = config.nextPhase;
    triesRemaining = LOCKOUT_PHASE_CONFIG[nextPhase].maxTries;
  }

  const updated = await upsertUserSecurity(user.operator_id, {
    lockout_phase: nextPhase,
    locked_until: lockedUntil,
    tries_remaining_in_phase: triesRemaining,
  });

  return {
    ...getLockoutState(updated, now),
    failed_attempts: updated.failed_attempts,
    email_sent: emailSent,
  };
}

export async function recordFailedAttempt(
  operatorId = DEFAULT_OPERATOR_ID
): Promise<LockoutState> {
  const user = await clearExpiredLockout(operatorId);
  const now = new Date();

  if (user.lockout_phase === 4 || isLocked(user, now)) {
    return getLockoutState(user, now);
  }

  const failed = user.failed_attempts + 1;
  const triesRemaining = Math.max(0, user.tries_remaining_in_phase - 1);
  const patched = await upsertUserSecurity(operatorId, {
    failed_attempts: failed,
    tries_remaining_in_phase: triesRemaining,
  });

  if (triesRemaining <= 0) {
    const result = await applyPhaseLockout(patched);
    return result;
  }

  return getLockoutState(patched, now);
}

export async function recordSuccessfulLogin(
  operatorId = DEFAULT_OPERATOR_ID,
  deviceId?: string,
  userAgent?: string
): Promise<AxonUserSecurity> {
  const user = await getUserSecurity(operatorId);
  const now = new Date();
  let fingerprints = [...(user.device_fingerprints || [])];

  if (deviceId) {
    const idx = fingerprints.findIndex((d) => d.device_id === deviceId);
    if (idx >= 0) {
      fingerprints[idx] = {
        ...fingerprints[idx],
        last_seen: now.toISOString(),
        user_agent: userAgent ?? fingerprints[idx].user_agent,
      };
    } else {
      fingerprints.push({
        device_id: deviceId,
        user_agent: userAgent,
        first_seen: now.toISOString(),
        last_seen: now.toISOString(),
      });
    }
    fingerprints = fingerprints.slice(-20);
  }

  return upsertUserSecurity(operatorId, {
    lockout_phase: 0,
    failed_attempts: 0,
    locked_until: null,
    tries_remaining_in_phase: LOCKOUT_PHASE_CONFIG[0].maxTries,
    device_fingerprints: fingerprints,
    last_security_verify_at: now.toISOString(),
  });
}

export function buildAuthStatus(user: AxonUserSecurity, hasPasskeys: boolean): AuthStatus {
  return {
    needsSecuritySetup: needsSecuritySetup(user),
    needsSecurityVerify: needsPeriodicSecurityVerify(user),
    displayName: user.display_name,
    lockout: getLockoutState(user),
    totpEnabled: user.two_fa_enabled,
    hasPasskeys,
  };
}

export async function getAuthStatus(operatorId = DEFAULT_OPERATOR_ID): Promise<AuthStatus> {
  const user = await getUserSecurity(operatorId);
  const passkeys = await listPasskeys(operatorId);
  return buildAuthStatus(user, passkeys.length > 0);
}

export async function verifyPasscode(
  passcode: string,
  operatorId = DEFAULT_OPERATOR_ID,
  options?: { deviceId?: string; userAgent?: string }
): Promise<VerifyPasscodeResult> {
  const user = await clearExpiredLockout(operatorId);
  const lockout = getLockoutState(user);

  if (lockout.locked) {
    return {
      ok: false,
      needsSecuritySetup: needsSecuritySetup(user),
      needsSecurityVerify: needsPeriodicSecurityVerify(user),
      displayName: user.display_name,
      lockout,
      error: lockout.requires_security_questions
        ? 'Account locked — answer security questions to recover'
        : 'Account locked due to too many failed attempts',
    };
  }

  const valid = await verifyPasscodeHash(passcode, user.passcode_hash);
  if (!valid) {
    const newLockout = await recordFailedAttempt(operatorId);
    return {
      ok: false,
      needsSecuritySetup: needsSecuritySetup(user),
      needsSecurityVerify: needsPeriodicSecurityVerify(user),
      displayName: user.display_name,
      lockout: newLockout,
      error: 'Invalid passcode',
    };
  }

  await recordSuccessfulLogin(operatorId, options?.deviceId, options?.userAgent);
  const refreshed = await getUserSecurity(operatorId);
  return {
    ok: true,
    needsSecuritySetup: needsSecuritySetup(refreshed),
    needsSecurityVerify: needsPeriodicSecurityVerify(refreshed),
    displayName: refreshed.display_name,
  };
}

export async function setupPasscode(
  passcode: string,
  operatorId = DEFAULT_OPERATOR_ID
): Promise<{ ok: boolean; error?: string }> {
  if (!passcode || passcode.length < 4) {
    return { ok: false, error: 'Passcode must be at least 4 characters' };
  }
  const hash = await hashPasscode(passcode);
  await upsertUserSecurity(operatorId, { passcode_hash: hash });
  return { ok: true };
}

async function listAnswers(operatorId: string): Promise<AxonSecurityAnswerRow[]> {
  return (await db().sbSelect(
    'axon_security_answers',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=*`
  )) as AxonSecurityAnswerRow[];
}

export async function saveSecurityAnswers(
  operatorId: string,
  answers: { question_id: string; answer_hash: string }[]
): Promise<void> {
  const now = new Date().toISOString();
  for (const answer of answers) {
    const existing = (await db().sbSelect(
      'axon_security_answers',
      `operator_id=eq.${encodeURIComponent(operatorId)}&question_id=eq.${encodeURIComponent(answer.question_id)}&select=operator_id&limit=1`
    )) as { operator_id: string }[];

    if (existing?.[0]) {
      await db().sbPatch(
        'axon_security_answers',
        `operator_id=eq.${encodeURIComponent(operatorId)}&question_id=eq.${encodeURIComponent(answer.question_id)}`,
        { answer_hash: answer.answer_hash, updated_at: now }
      );
    } else {
      await db().sbInsert('axon_security_answers', {
        operator_id: operatorId,
        question_id: answer.question_id,
        answer_hash: answer.answer_hash,
        created_at: now,
        updated_at: now,
      });
    }
  }
  await upsertUserSecurity(operatorId, { security_questions_set_at: now });
}

export async function saveSecurityQuestions(
  answers: Array<{ questionId: string; answer: string }>,
  operatorId = DEFAULT_OPERATOR_ID
): Promise<{ ok: boolean; error?: string }> {
  if (answers.length !== 3) {
    return { ok: false, error: 'Exactly 3 security questions required' };
  }

  const user = await getUserSecurity(operatorId);
  if (user.security_questions_set_at && !canChangeSecurityQuestions(user)) {
    return { ok: false, error: 'Security questions cannot be changed yet' };
  }

  const ids = new Set<string>();
  const stored: { question_id: string; answer_hash: string }[] = [];

  for (const item of answers) {
    if (!getSecurityQuestionById(item.questionId)) {
      return { ok: false, error: `Invalid question: ${item.questionId}` };
    }
    if (ids.has(item.questionId)) {
      return { ok: false, error: 'Duplicate questions not allowed' };
    }
    if (!item.answer?.trim()) {
      return { ok: false, error: 'All answers required' };
    }
    ids.add(item.questionId);
    stored.push({
      question_id: item.questionId,
      answer_hash: await hashSecurityAnswer(item.answer),
    });
  }

  await saveSecurityAnswers(operatorId, stored);
  await upsertUserSecurity(operatorId, { last_security_verify_at: new Date().toISOString() });
  return { ok: true };
}

export async function verifySecurityQuestions(
  answers: Array<{ questionId: string; answer: string }>,
  operatorId = DEFAULT_OPERATOR_ID
): Promise<{ ok: boolean; error?: string }> {
  const stored = await listAnswers(operatorId);
  if (stored.length < 3) {
    return { ok: false, error: 'Security questions not configured' };
  }
  if (answers.length !== 3) {
    return { ok: false, error: 'Exactly 3 answers required' };
  }

  for (const item of answers) {
    const row = stored.find((s) => s.question_id === item.questionId);
    if (!row) return { ok: false, error: 'Invalid question' };
    if (!(await verifySecurityAnswer(item.answer, row.answer_hash))) {
      return { ok: false, error: 'Incorrect answer' };
    }
  }

  await upsertUserSecurity(operatorId, {
    lockout_phase: 0,
    failed_attempts: 0,
    locked_until: null,
    tries_remaining_in_phase: LOCKOUT_PHASE_CONFIG[0].maxTries,
    last_security_verify_at: new Date().toISOString(),
  });

  return { ok: true };
}

export async function unlockAfterSecurityQuestions(
  operatorId = DEFAULT_OPERATOR_ID
): Promise<AxonUserSecurity> {
  return upsertUserSecurity(operatorId, {
    lockout_phase: 0,
    failed_attempts: 0,
    locked_until: null,
    tries_remaining_in_phase: LOCKOUT_PHASE_CONFIG[0].maxTries,
    last_security_verify_at: new Date().toISOString(),
  });
}

export async function listPasskeys(operatorId = DEFAULT_OPERATOR_ID): Promise<AxonPasskeyRow[]> {
  return (await db().sbSelect(
    'axon_passkeys',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=*`
  )) as AxonPasskeyRow[];
}

export async function getAuthRecord(operatorId = DEFAULT_OPERATOR_ID): Promise<AuthRecordView> {
  const user = await getUserSecurity(operatorId);
  const passkeys = await listPasskeys(operatorId);
  const challenge = await getWebAuthnChallenge(operatorId);

  return {
    operatorId,
    displayName: user.display_name,
    securitySetupComplete: Boolean(user.security_questions_set_at),
    totpEnabled: user.two_fa_enabled,
    totpSecret: user.two_fa_secret,
    passkeys: passkeys.map((pk) => ({
      id: pk.credential_id,
      publicKey: pk.public_key,
      counter: Number(pk.counter),
      transports: pk.transports ?? undefined,
    })),
    webauthnChallenge: challenge,
  };
}

export async function updateAuthRecord(
  operatorId: string,
  patch: {
    totpEnabled?: boolean;
    totpSecret?: string | null;
    webauthnChallenge?: string | null;
    passkeys?: AuthRecordView['passkeys'];
  }
): Promise<AuthRecordView> {
  if (patch.totpEnabled !== undefined || patch.totpSecret !== undefined) {
    await upsertUserSecurity(operatorId, {
      two_fa_enabled: patch.totpEnabled,
      two_fa_secret: patch.totpSecret ?? null,
    });
  }

  if (patch.webauthnChallenge !== undefined) {
    if (patch.webauthnChallenge) {
      await storeWebAuthnChallenge(operatorId, patch.webauthnChallenge);
    } else {
      await clearWebAuthnChallenge(operatorId);
    }
  }

  if (patch.passkeys) {
    const client = db();
    const now = new Date().toISOString();
    for (const pk of patch.passkeys) {
      const existing = (await client.sbSelect(
        'axon_passkeys',
        `operator_id=eq.${encodeURIComponent(operatorId)}&credential_id=eq.${encodeURIComponent(pk.id)}&select=credential_id&limit=1`
      )) as { credential_id: string }[];

      if (existing?.[0]) {
        await client.sbPatch(
          'axon_passkeys',
          `operator_id=eq.${encodeURIComponent(operatorId)}&credential_id=eq.${encodeURIComponent(pk.id)}`,
          {
            public_key: pk.publicKey,
            counter: pk.counter,
            transports: pk.transports ?? null,
            updated_at: now,
          }
        );
      } else {
        await client.sbInsert('axon_passkeys', {
          operator_id: operatorId,
          credential_id: pk.id,
          public_key: pk.publicKey,
          counter: pk.counter,
          transports: pk.transports ?? null,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  return getAuthRecord(operatorId);
}

async function storeWebAuthnChallenge(operatorId: string, challenge: string) {
  const token = `challenge_${operatorId}_${randomBytes(8).toString('hex')}`;
  await clearWebAuthnChallenge(operatorId);
  await db().sbInsert('axon_security_tokens', {
    token,
    operator_id: operatorId,
    type: 'webauthn_challenge',
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    metadata: challenge,
  });
}

async function getWebAuthnChallenge(operatorId: string): Promise<string | null> {
  const rows = (await db().sbSelect(
    'axon_security_tokens',
    `operator_id=eq.${encodeURIComponent(operatorId)}&type=eq.webauthn_challenge&used_at=is.null&select=*&order=created_at.desc&limit=1`
  )) as Array<AxonSecurityTokenRow & { metadata?: string }>;

  const row = rows?.[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.metadata ?? row.token;
}

async function clearWebAuthnChallenge(operatorId: string) {
  const key = getSupabaseKey();
  await fetch(
    `https://kxijunwgbrlfzvgkhklo.supabase.co/rest/v1/axon_security_tokens?operator_id=eq.${operatorId}&type=eq.webauthn_challenge`,
    {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
    }
  );
}

export function hashRecoveryToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createRecoveryToken(
  operatorId = DEFAULT_OPERATOR_ID
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await db().sbInsert('axon_security_tokens', {
    token: hashRecoveryToken(token),
    operator_id: operatorId,
    type: 'recovery',
    expires_at: expiresAt,
    used_at: null,
    created_at: new Date().toISOString(),
  });
  return { token, expiresAt };
}

export async function validateRecoveryToken(
  token: string,
  operatorId = DEFAULT_OPERATOR_ID
): Promise<{ valid: boolean; error?: string }> {
  const rows = (await db().sbSelect(
    'axon_security_tokens',
    `token=eq.${hashRecoveryToken(token)}&operator_id=eq.${encodeURIComponent(operatorId)}&type=eq.recovery&select=*&limit=1`
  )) as AxonSecurityTokenRow[];

  const row = rows?.[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false, error: 'Invalid or expired recovery token' };
  }
  return { valid: true };
}

export async function consumeRecoveryToken(token: string): Promise<boolean> {
  const tokenHash = hashRecoveryToken(token);
  try {
    await db().sbPatch('axon_security_tokens', `token=eq.${tokenHash}`, {
      used_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearLockout(operatorId = DEFAULT_OPERATOR_ID): Promise<void> {
  await upsertUserSecurity(operatorId, {
    failed_attempts: 0,
    locked_until: null,
    lockout_phase: 0,
    tries_remaining_in_phase: LOCKOUT_PHASE_CONFIG[0].maxTries,
  });
}

export async function getSecurityAnswersForRecovery(operatorId = DEFAULT_OPERATOR_ID) {
  return listAnswers(operatorId);
}

export const getSecurityAnswers = listAnswers;
