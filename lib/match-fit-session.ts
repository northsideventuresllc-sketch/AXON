import { createHash, timingSafeEqual } from 'crypto';

export const MF_SESSION_COOKIE = 'mf_admin_session';
export const MF_COOKIE_MAX_AGE = 60 * 60 * 8;

const BRAIN_KEYS = ['MF_ADMIN_ACCESS_CODE', 'mf_admin_access_code'];

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

function sessionSecret(): string {
  return (
    process.env.MF_ADMIN_SECRET ||
    process.env.AXON_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    'dev-fallback'
  );
}

/** Session token for access-code auth (no email in cookie). */
export function deriveMatchFitSessionToken(): string {
  return createHash('sha256').update(`mf:access:${sessionSecret()}`).digest('hex');
}

/** Env-only access code (sync). */
export function getMatchFitAccessCode(): string {
  return process.env.MF_ADMIN_ACCESS_CODE?.trim() ?? '';
}

/** Env first, then NI-Brain ni_platform_secrets. */
export async function resolveMatchFitAccessCode(): Promise<string> {
  const fromEnv = getMatchFitAccessCode();
  if (fromEnv) return fromEnv;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return '';

  for (const key of BRAIN_KEYS) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/ni_platform_secrets?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Accept: 'application/json',
          },
        },
      );
      if (!r.ok) continue;
      const rows = await r.json();
      const value = rows?.[0]?.value?.trim();
      if (value) return value;
    } catch {
      /* try next key */
    }
  }

  return '';
}

/** Legacy email/password — used only when access code env is unset. */
export function getMatchFitLegacyCredentials() {
  return {
    email: process.env.MF_ADMIN_EMAIL ?? '',
    password: process.env.MF_ADMIN_PASSWORD ?? '',
  };
}

export function safeEq(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, Buffer.alloc(ab.length));
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export async function isMatchFitSessionValid(storedCookie: string): Promise<boolean> {
  const code = await resolveMatchFitAccessCode();
  if (code) {
    return safeEq(storedCookie, deriveMatchFitSessionToken());
  }
  const { email } = getMatchFitLegacyCredentials();
  if (!email) return false;
  const legacy = createHash('sha256').update(`mf:${email}:${sessionSecret()}`).digest('hex');
  return safeEq(storedCookie, legacy);
}

export const MATCH_FIT_ACCESS_HINT =
  'Set MF_ADMIN_ACCESS_CODE (env or ni_platform_secrets).';
