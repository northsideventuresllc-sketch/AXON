/**
 * Problem #9 — MCP build system, starting case: Supabase.
 *
 * Plain .mjs on purpose, same reasoning as skill-guard.mjs and
 * axon-agent-bus.mjs: this has to run under both Next.js/TS
 * (imported from app/api/axon-v0/mcp/supabase/route.ts) and raw `node`
 * with no TS loader (this file's own test, tests/mcp-supabase.test.mjs).
 *
 * NO CREDENTIAL EVER LIVES HERE. This module only reads *whether* a key is
 * present (a boolean) and turns connection outcomes into plain-English
 * copy — it never accepts, returns, logs, or stores the key value itself.
 * The real key stays exactly where every other axon-v0 route already reads
 * it from: `process.env.SUPABASE_SERVICE_KEY` /
 * `process.env.SUPABASE_SERVICE_ROLE_KEY`, sourced from GitHub Actions
 * secrets / `ni_platform_secrets` per AGENTS.md ("No secrets in git").
 */

// Same fallback order every other axon-v0 module already uses
// (app/api/axon-v0/skills/route.ts, lib/axon-v0/store.ts) — kept as one
// named list here so the "which env vars" question has one answer.
export const SUPABASE_MCP_KEY_ENV_VARS = ['SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/**
 * Registry identity for the Supabase MCP connection row. `scope: 'mcp'` is
 * how the Skills & MCP page's isMcp() (components: app/(axon-v0)/skills/page.tsx)
 * tells an MCP row from a plain skill row, since nvg_skill_registry has no
 * dedicated `kind`/`category` column to migrate in — see the "no DB
 * migrations" hard stop this task was scoped under.
 */
export const SUPABASE_MCP_NAME = 'supabase';
export const SUPABASE_MCP_SCOPE = 'mcp';

/** True if a Supabase service key is present in the given env, false otherwise.
 *  Never returns or logs the value — presence only. `env` is injectable so
 *  this stays testable without ever touching real process.env. */
export function hasSupabaseMcpKey(env = process.env) {
  return SUPABASE_MCP_KEY_ENV_VARS.some((k) => typeof env[k] === 'string' && env[k].trim().length > 0);
}

/**
 * Turn a connection attempt's outcome into the plain-English state the UI is
 * allowed to render. Never pass a raw error message or HTTP status through —
 * callers must reduce it to `verified: boolean` first.
 *
 * @param {object} args
 * @param {boolean} args.hasKey - a key is present in this account's secrets.
 * @param {boolean} [args.verified] - a live read against Supabase succeeded.
 *   Ignored when hasKey is false.
 * @returns {{ connected: boolean, status: 'connected'|'needs_key'|'check_failed',
 *   label: string, detail: string }}
 */
export function describeSupabaseMcpState({ hasKey, verified }) {
  if (!hasKey) {
    return {
      connected: false,
      status: 'needs_key',
      label: 'Needs a key',
      detail:
        'Add a Supabase service key to this account’s secrets (SUPABASE_SERVICE_ROLE_KEY), then connect again.',
    };
  }
  if (verified) {
    return {
      connected: true,
      status: 'connected',
      label: 'Connected',
      detail: 'Reading NI-Brain tables live.',
    };
  }
  return {
    connected: false,
    status: 'check_failed',
    label: 'Key set, connection failed',
    detail: 'A key is on file but the last check could not reach Supabase. Try again shortly.',
  };
}

/** Registry row body for creating/refreshing the Supabase MCP connection —
 *  same shape the skills POST route already writes for a manual skill
 *  (name/scope/status/is_golden/version/purpose), just with the MCP scope.
 *  Never includes the key itself, only the plain-English state description. */
export function supabaseMcpRegistryRow(state) {
  return {
    name: SUPABASE_MCP_NAME,
    scope: SUPABASE_MCP_SCOPE,
    status: state.connected ? 'active' : 'proposed',
    is_golden: false,
    version: 1,
    purpose: `Supabase — ${state.detail}`,
  };
}
