#!/usr/bin/env node
/**
 * NVG PRESENCE UPSERT — mechanical `nvg_agent_presence` write, identical in every NVG repo
 * (locked-rule-sync). Canonical copy: nv-vault/.claude/hooks/nvg-presence-upsert.mjs.
 * Edit here, copy everywhere.
 *
 * WHY THIS EXISTS (ticket PULSE-PRESENCE-UPSERT-NOT-MECHANICAL-0913): BOOT v2 step 5
 * ("Upsert nvg_agent_presence (boot)") has always been prose an agent has to remember to
 * do with its own Supabase tool call — nothing enforced it. `last_seen_at` stopped moving
 * for several named agents that had provably run since, because remembering a manual
 * upsert is not a gate. This script is the mechanical form of that step, the same shape
 * as `nvg-tickets-first-gate.mjs` (mechanical ticket check) and `nvg-close.mjs` (mechanical
 * close-out): called automatically, fails open, never blocks the session.
 *
 * RUNS AS: invoked from `.claude/hooks/nvg-boot-contract.sh` at every SessionStart /
 * compaction-resume (the "boot" moment BOOT v2 step 5 already names). Not its own
 * registered hook — no `settings.json` change needed, it rides the existing SessionStart
 * entry for `nvg-boot-contract.sh`.
 *
 * WHAT IT DOES
 *  - Only runs when an agent name resolves — same resolution order as
 *    `nvg-tickets-first-gate.mjs`: env `NVG_AGENT_NAME` first, then the
 *    `.nvg/agent-name` file, same validation regex. No name (JB's own interactive
 *    session) -> silent no-op, never writes a row for "nobody".
 *  - Upserts ONE row into `nvg_agent_presence` (PK: `agent_name`) via PostgREST
 *    `Prefer: resolution=merge-duplicates` — `last_seen_at=now()`, `updated_by` set to
 *    `'boot-contract-hook'` (never an agent's own name) so this mechanical path is
 *    provably distinct from a manual agent-authored upsert, per the ticket's DONE MEANS.
 *  - `surface` / `session_ref` / `last_action` are filled from whatever environment the
 *    harness actually exposes, with honest fallbacks — never fabricated as if verified.
 *  - FAILS OPEN, always: no `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` in env, a
 *    network error, a timeout, a non-2xx response, or any unexpected exception -> logs one
 *    line to stderr and exits 0. A broken or missing presence write must never turn into a
 *    stuck or failed session start — same fail-open convention as every other NVG hook.
 *  - Bounded: a 5s network timeout, called from boot-contract.sh so it can never hang
 *    session start indefinitely even if the timeout mechanism itself misbehaves.
 *
 * Manual test / CLI override (for verifying this hook without waiting on a real fired
 * session — see the PR description for a real run against the live brain):
 *   NVG_AGENT_NAME=BUILD SUPABASE_SERVICE_ROLE_KEY=... node .claude/hooks/nvg-presence-upsert.mjs
 *   node .claude/hooks/nvg-presence-upsert.mjs --agent BUILD --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const AGENT_NAME_FILE = path.join(PROJECT, '.nvg', 'agent-name');
const AGENT_NAME_RE = /^[A-Za-z0-9 _.-]{1,60}$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
function flag(name) {
  return process.argv.includes(name);
}

function key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
}

// Same resolution order + validation as nvg-tickets-first-gate.mjs's resolveAgentName(),
// plus a --agent CLI override for manual testing (never used by the automatic boot path).
export function resolveAgentName({ argOverride = arg('--agent') } = {}) {
  if (argOverride && AGENT_NAME_RE.test(argOverride)) return argOverride;
  const fromEnv = (process.env.NVG_AGENT_NAME || '').trim();
  if (fromEnv && AGENT_NAME_RE.test(fromEnv)) return fromEnv;
  try {
    const fromFile = fs.readFileSync(AGENT_NAME_FILE, 'utf8').trim();
    if (fromFile && AGENT_NAME_RE.test(fromFile)) return fromFile;
  } catch { /* no name file yet -- this hook no-ops the same as before */ }
  return '';
}

// nvg_agent_presence_surface_check — must match this exactly or the upsert 400s.
const VALID_SURFACES = new Set(['cowork_ccr', 'claude_code_cloud', 'claude_code_local', 'axon_local', 'other']);

// Pure builder so this is unit-testable without a network call.
export function buildPresenceRow(agent, env = process.env) {
  const sessionRef =
    env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || `boot-${new Date().toISOString()}`;
  const surface = VALID_SURFACES.has(env.NVG_SURFACE) ? env.NVG_SURFACE : 'claude_code_cloud';
  return {
    agent_name: agent,
    surface,
    session_ref: sessionRef,
    last_seen_at: new Date().toISOString(),
    last_action: 'boot: mechanical presence upsert (nvg-presence-upsert hook)',
    status: 'active',
    updated_by: 'boot-contract-hook',
  };
}

export async function upsertPresence(row, { url = SUPABASE_URL, apiKey = key(), fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('no SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in env');
  const r = await fetchImpl(`${url}/rest/v1/nvg_agent_presence?on_conflict=agent_name`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
    signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
  });
  if (!r.ok) throw new Error(`nvg_agent_presence upsert: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return true;
}

async function main() {
  const agent = resolveAgentName();
  if (!agent) return; // no named/dispatched agent this session -- nothing to write

  const row = buildPresenceRow(agent);
  if (flag('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, wouldUpsert: row }));
    return;
  }
  try {
    await upsertPresence(row);
    console.log(JSON.stringify({ ok: true, agent_name: row.agent_name, last_seen_at: row.last_seen_at, updated_by: row.updated_by }));
  } catch (e) {
    process.stderr.write(`nvg-presence-upsert: fail-open (${e.message})\n`);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`nvg-presence-upsert: unexpected error, failing open (${e.message})\n`);
    process.exit(0);
  });
}
