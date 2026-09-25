#!/usr/bin/env node
/**
 * AXON Global Morality Halt (GMH) — emergency stop for the whole agent fleet.
 * Dispatch AX-MORAL-HALT (2026-07-20).
 *
 * Unlike lib/axon-fire-gate-core.mjs (defaults to HOLD, blocks a fixed list of
 * send/publish/fire actions until JB explicitly flips it to FIRE), this is a
 * kill switch: it defaults to "clear" and only trips when something has
 * actually gone wrong — a human/council call, or a purpose screen catching an
 * instance whose stated purpose reads as divergence, hacking, or humanity-harm.
 * Any caller can seal the fleet; only a human clears it back to "clear".
 *
 * Resolution order for the current state:
 *   1. Env `AXON_GLOBAL_HALT_OVERRIDE` (clear | halted | rebuild_required) — hard
 *      override for a given deploy/session.
 *   2. NI-Brain row in `ni_platform_secrets` (key `AXON_GLOBAL_HALT`) — the live
 *      switch, shared across every machine and repo. This is the Vault SoT: JB
 *      or a council decision trips/clears it here.
 *   3. `config/axon-global-halt.json` — local cache of the last state this
 *      checkout actually observed. Used when NI-Brain is unreachable, so a DB
 *      blip doesn't erase a real halt (or fabricate one).
 *   4. Default: clear.
 *
 * A successful read from (1) or (2) refreshes the local cache file, so a later
 * offline read sees the last known-good state instead of a stale default.
 *
 * `sealFleet`/`clearHalt` always write the local file first (so the halt is
 * durable even fully offline), then best-effort mirror to NI-Brain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseClient } from '../../lib/supabase.mjs';
import { tryGetSupabaseServiceKey } from '../../lib/axon-secrets.mjs';

export const GLOBAL_HALT_SECRET_KEY = 'AXON_GLOBAL_HALT';
export const VALID_STATUSES = ['clear', 'halted', 'rebuild_required'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_HALT_PATH = path.join(__dirname, '..', '..', 'config', 'axon-global-halt.json');

const DEFAULT_STATE = { status: 'clear', reason: null, set_by: null, set_at: null };

/** Purpose-screen deny patterns — matched against an instance's stated purpose at spawn. */
export const PURPOSE_DENY_PATTERNS = [
  {
    id: 'divergence',
    label: 'diverges from operator instructions/purpose',
    re: /\b(diverg(e|ing|ence)|drift(ing)? from (my|its|the) (instructions|purpose)|ignore (my|the) (creator|operator)|go rogue)\b/i,
  },
  {
    id: 'hack',
    label: 'hacking / unauthorized access',
    re: /\b(hack|exploit|bypass (security|auth\w*)|privilege escalat\w*|unauthorized access|crack (a|the) password)\b/i,
  },
  {
    id: 'humanity-harm',
    label: 'harm to humans/humanity',
    re: /\b(harm (humans?|humanity)|kill (a |the )?(human|person|people)|build\s+a?\s*weapon|mass casualt\w*|self[- ]replicat\w+ without)\b/i,
  },
];

function normalizeStatus(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return VALID_STATUSES.includes(v) ? v : null;
}

function readLocalHaltFile() {
  try {
    const raw = fs.readFileSync(LOCAL_HALT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const status = normalizeStatus(parsed.status);
    if (!status) return DEFAULT_STATE;
    return {
      status,
      reason: parsed.reason ?? null,
      set_by: parsed.set_by ?? null,
      set_at: parsed.set_at ?? null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeLocalHaltFile(state) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_HALT_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_HALT_PATH, `${JSON.stringify(state, null, 2)}\n`);
  } catch (err) {
    // Local disk write failing is a real problem but must never block a
    // caller trying to read/seal the halt state — log and move on.
    console.error(`axon-global-halt: failed to write local cache (${err.message})`);
  }
}

async function readNiBrainHalt() {
  const key = tryGetSupabaseServiceKey();
  if (!key) return null;
  try {
    const { sbSelect } = createSupabaseClient(key);
    const rows = await sbSelect(
      'ni_platform_secrets',
      `key=eq.${encodeURIComponent(GLOBAL_HALT_SECRET_KEY)}&select=value&limit=1`,
    );
    const raw = rows?.[0]?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const status = normalizeStatus(parsed.status);
    if (!status) return null;
    return {
      status,
      reason: parsed.reason ?? null,
      set_by: parsed.set_by ?? null,
      set_at: parsed.set_at ?? null,
    };
  } catch {
    // Fail closed on *reads that found nothing* only in the sense that we
    // fall through to the local cache below — never invent a bad JSON state.
    return null;
  }
}

async function persistNiBrainHalt(state) {
  const key = tryGetSupabaseServiceKey();
  if (!key) return false;
  try {
    const { sbUpsertSecret } = createSupabaseClient(key);
    await sbUpsertSecret(GLOBAL_HALT_SECRET_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error(`axon-global-halt: failed to mirror state to NI-Brain (${err.message})`);
    return false;
  }
}

/** Resolve the current halt state. Always resolves; never throws. */
export async function checkGlobalHalt() {
  const envStatus = normalizeStatus(process.env.AXON_GLOBAL_HALT_OVERRIDE);
  if (envStatus) {
    const state = { status: envStatus, reason: 'env override', set_by: 'env', set_at: null };
    return { ...state, source: 'env' };
  }

  const brainState = await readNiBrainHalt();
  if (brainState) {
    writeLocalHaltFile(brainState);
    return { ...brainState, source: 'ni-brain' };
  }

  const localState = readLocalHaltFile();
  return { ...localState, source: 'local-cache' };
}

/** Thrown when a halted/rebuild_required state blocks the caller. */
export class GlobalHaltError extends Error {
  constructor(state, action) {
    super(
      `AXON Global Morality Halt is "${state.status}"${action ? ` — "${action}" is blocked` : ''}${
        state.reason ? `: ${state.reason}` : ''
      }`,
    );
    this.name = 'GlobalHaltError';
    this.state = state;
    this.action = action;
    this.status = 423;
  }
}

/** Throws {@link GlobalHaltError} unless the fleet is currently clear. */
export async function assertHaltClear(action) {
  const state = await checkGlobalHalt();
  if (state.status !== 'clear') {
    throw new GlobalHaltError(state, action);
  }
  return state;
}

async function setState(status, { reason = null, setBy = 'unknown' } = {}) {
  const state = { status, reason, set_by: setBy, set_at: new Date().toISOString() };
  // Local write first — the seal must land even fully offline.
  writeLocalHaltFile(state);
  await persistNiBrainHalt(state);
  return state;
}

/** Seal the fleet. Any caller can trip this — it fails toward safety. */
export async function sealFleet(reason, { setBy = 'unknown', status = 'halted' } = {}) {
  if (!VALID_STATUSES.includes(status) || status === 'clear') {
    throw new Error(`sealFleet: status must be "halted" or "rebuild_required", got "${status}"`);
  }
  const state = await setState(status, { reason, setBy });
  console.error(`AXON GLOBAL MORALITY HALT SEALED (${status}) by ${setBy}: ${reason || '(no reason given)'}`);
  return state;
}

/** Clear the halt. Intended for a human/council action, not automated recovery. */
export async function clearHalt({ setBy = 'unknown', note = null } = {}) {
  const state = await setState('clear', { reason: note, setBy });
  console.log(`AXON Global Morality Halt cleared by ${setBy}${note ? `: ${note}` : ''}`);
  return state;
}

/**
 * Screen a stated purpose/instruction string against the deny patterns.
 * Pure and synchronous — no I/O, safe to call on every instance spawn.
 */
export function screenPurpose(purposeText) {
  const text = String(purposeText || '');
  const matched = PURPOSE_DENY_PATTERNS.filter((p) => p.re.test(text));
  return { allowed: matched.length === 0, matched: matched.map((m) => ({ id: m.id, label: m.label })) };
}

/**
 * Purpose screen for instance spawn. On a match this seals the fleet (not
 * just this one instance — a stated purpose like this means something
 * upstream is already compromised) and throws.
 */
export async function assertPurposeAllowed(purposeText, { instanceId = 'unknown' } = {}) {
  const { allowed, matched } = screenPurpose(purposeText);
  if (allowed) return;
  const reasons = matched.map((m) => m.label).join('; ');
  const state = await sealFleet(`purpose screen tripped by instance "${instanceId}": ${reasons}`, {
    setBy: 'purpose-screen',
  });
  throw new GlobalHaltError(state, `spawn of "${instanceId}"`);
}

/** Print a short human-readable status banner. Call at the top of any entrypoint. */
export async function printTrustBanner() {
  const state = await checkGlobalHalt();
  const ok = state.status === 'clear';
  const line = ok
    ? `[AXON TRUST] clear — fleet is not halted (source: ${state.source})`
    : `[AXON TRUST] *** ${state.status.toUpperCase()} *** (source: ${state.source}) — ${
        state.reason || 'no reason recorded'
      } (set by ${state.set_by || 'unknown'}${state.set_at ? ` at ${state.set_at}` : ''})`;
  console.log(line);
  return state;
}

// ---- tiny CLI so JB/ops can trip or clear this without writing SQL ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, ...rest] = process.argv.slice(2);
  const setBy = process.env.USER || 'cli';
  if (cmd === 'status') {
    const state = await checkGlobalHalt();
    console.log(JSON.stringify(state, null, 2));
  } else if (cmd === 'halt' || cmd === 'seal') {
    const state = await sealFleet(rest.join(' ') || 'manual CLI halt', { setBy });
    console.log(JSON.stringify(state, null, 2));
  } else if (cmd === 'rebuild-required') {
    const state = await sealFleet(rest.join(' ') || 'manual CLI rebuild_required', { setBy, status: 'rebuild_required' });
    console.log(JSON.stringify(state, null, 2));
  } else if (cmd === 'clear') {
    const state = await clearHalt({ setBy, note: rest.join(' ') || null });
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log('Usage: node scripts/lib/axon-global-halt.mjs <status|halt "<reason>"|rebuild-required "<reason>"|clear ["<note>"]>');
    process.exitCode = 1;
  }
}
