/**
 * AXON FIRE gate — global safety rail for autonomous actions.
 *
 * Everything defaults to HOLD. While HOLD is active, no automation may send an
 * email, publish/schedule content, fire a dispatch, or enable a cron. JB flips
 * the gate to FIRE (via the Fire / Hold Control tool) when ready to go live.
 *
 * Resolution order for the current mode:
 *   1. Env `AXON_FIRE_MODE` (FIRE | HOLD) — hard override for a given deploy.
 *   2. NI-Brain row in `ni_platform_secrets` (key `AXON_FIRE_MODE`).
 *   3. Default HOLD.
 *
 * Reads never throw — if NI-Brain is unreachable we fail safe to HOLD.
 *
 * Plain-JS core so it can be imported both from Next.js/TS routes (via the
 * `axon-fire-gate.ts` re-export wrapper) and directly from raw Node scripts
 * (`scripts/*.mjs`, `lib/telegram-handler.mjs`) that run under GitHub Actions'
 * plain `node` — no TypeScript loader available there.
 */
import { createSupabaseClient } from './supabase.mjs';

export const FIRE_GATE_SECRET_KEY = 'AXON_FIRE_MODE';

/** Human-readable list of what the gate blocks while HOLD is active. */
export const FIRE_BLOCKED_ACTIONS = [
  {
    id: 'outreach.run',
    label: 'NI Outreach sends',
    detail: 'Email + LinkedIn outreach drafts stay in the queue — nothing sends.',
  },
  {
    id: 'dispatch.fire',
    label: 'Repo Manager dispatch',
    detail: 'Hermes dispatch fires to GitHub Actions are blocked.',
  },
  {
    id: 'cron.toggle',
    label: 'Cron / scheduled jobs',
    detail: 'Enabling scheduled workflows is blocked (disabling is always allowed).',
  },
  {
    id: 'content.publish',
    label: 'Content Machine publish / schedule',
    detail: 'Posts can be drafted, approved, and edited — publishing/scheduling is blocked.',
  },
  {
    id: 'reddit.post',
    label: 'Reddit posts + replies',
    detail: 'Promo posts and thread replies wait for manual approval — nothing posts.',
  },
];

function normalizeMode(value) {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === 'FIRE' || v === 'ON' || v === 'LIVE' || v === 'GO') return 'FIRE';
  if (v === 'HOLD' || v === 'OFF' || v === 'SAFE') return 'HOLD';
  return null;
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

async function readNiBrainMode() {
  const key = getSupabaseKey();
  if (!key) return null;
  try {
    const { sbSelect } = createSupabaseClient(key);
    const rows = await sbSelect(
      'ni_platform_secrets',
      `key=eq.${encodeURIComponent(FIRE_GATE_SECRET_KEY)}&select=value&limit=1`,
    );
    return normalizeMode(rows?.[0]?.value);
  } catch {
    // Fail safe — unreachable brain means HOLD.
    return null;
  }
}

/** Resolve the current gate mode. Always resolves; defaults to HOLD. */
export async function getFireMode() {
  const envMode = normalizeMode(process.env.AXON_FIRE_MODE);
  if (envMode) {
    return { mode: envMode, source: 'env', blocked: FIRE_BLOCKED_ACTIONS };
  }
  const brainMode = await readNiBrainMode();
  if (brainMode) {
    return { mode: brainMode, source: 'ni-brain', blocked: FIRE_BLOCKED_ACTIONS };
  }
  return { mode: 'HOLD', source: 'default', blocked: FIRE_BLOCKED_ACTIONS };
}

/**
 * Persist a new gate mode to NI-Brain. Env override (if set) still wins on read,
 * so this reports whether the env is masking the stored value.
 */
export async function setFireMode(mode) {
  const key = getSupabaseKey();
  if (!key) {
    throw new Error('SUPABASE_SERVICE_KEY not configured — cannot persist FIRE mode');
  }
  const { sbUpsertSecret } = createSupabaseClient(key);
  await sbUpsertSecret(FIRE_GATE_SECRET_KEY, mode);
  return getFireMode();
}

/** Thrown by assertFireAllowed when the gate is HOLD. */
export class FireHoldError extends Error {
  constructor(action) {
    super(`AXON is on HOLD — "${action}" is blocked until JB fires the gate.`);
    this.name = 'FireHoldError';
    this.action = action;
    this.status = 423;
  }
}

/**
 * Guard used by mutation routes. Throws {@link FireHoldError} (HTTP 423) when the
 * gate is HOLD. Call before performing any send / publish / fire.
 */
export async function assertFireAllowed(action) {
  const { mode } = await getFireMode();
  if (mode !== 'FIRE') {
    throw new FireHoldError(action);
  }
}

/** True when live actions are permitted. */
export async function isFireAllowed() {
  const { mode } = await getFireMode();
  return mode === 'FIRE';
}
