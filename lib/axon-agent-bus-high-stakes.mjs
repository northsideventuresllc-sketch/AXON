/**
 * AXON agent_bus high-stakes filter — AX-SMALL-BUILDS-BUNDLE-0904 item (2).
 *
 * Lets the operator surface show just the few open agent_bus threads that
 * actually need JB's eyes each cycle, instead of every open thread.
 *
 * Two-tier read, in preference order:
 *   1. `agent_bus_high_stakes_v` — the DB view in
 *      scripts/axon_agent_bus_high_stakes_bc.sql. NOT YET APPLIED to the live
 *      DB (this PR ships the migration file only, per standing instruction
 *      never to run DDL directly) — so this is the "once a human applies it"
 *      path, not the guaranteed one.
 *   2. computeHighStakesLocally() over a plain `agent_bus` select — runs the
 *      identical heuristic in JS (reusing the real classifyGatedAction() and
 *      isMergeDeployAction() from lib/axon-agent-bus.mjs, not duplicated
 *      regexes) so the operator surface
 *      is useful FROM DAY ONE, before the migration is ever applied, and keeps
 *      working exactly the same after it is (the view becomes the source of
 *      truth then; this fallback keeps existing as a safety net).
 *
 * Never throws — a missing view (42P01 / PostgREST "relation not found") or
 * any other Supabase error just falls through to the next tier, and a
 * failure on every tier resolves to an empty list, same "single bad source
 * never breaks the poll" convention as lib/axon-v0/agent-comms.ts.
 */
import { classifyGatedAction, isMergeDeployAction } from './axon-agent-bus.mjs';

const STALE_OPEN_AFTER_MS = 24 * 60 * 60 * 1000; // matches backlog-janitor's staleness window
const FALLBACK_SCAN_LIMIT = 200;

/**
 * Pure — same heuristic as the SQL view's WHERE clause, but calling the real
 * gate classifier instead of a re-typed regex. Exported so it's unit-testable
 * with a plain object, no Supabase involved.
 * @param {{needs_answer?:boolean, status?:string, subject?:string, body?:object, created_at?:string}} row
 */
export function computeHighStakesLocally(row) {
  if (!row || row.status !== 'open' || !row.needs_answer) return false;

  const task = (row.body && row.body.task) || row.subject || '';
  if (classifyGatedAction(task) || isMergeDeployAction(task)) return true;

  if (row.body && Object.prototype.hasOwnProperty.call(row.body, 'gated')) return true;

  if (row.created_at) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs > STALE_OPEN_AFTER_MS) return true;
  }

  return false;
}

/**
 * @param {{sbSelect: (table:string, filter?:string) => Promise<any[]>}} sb - from
 *   lib/supabase.mjs's createSupabaseClient(key)
 * @param {{limit?:number}} opts
 * @returns {Promise<{rows:Array, source:'view'|'heuristic-fallback'|'error', error?:string}>}
 */
export async function listHighStakesAgentBus(sb, { limit = 25 } = {}) {
  if (!sb || typeof sb.sbSelect !== 'function') {
    return { rows: [], source: 'error', error: 'no Supabase client provided' };
  }

  try {
    const rows = await sb.sbSelect(
      'agent_bus_high_stakes_v',
      `high_stakes=eq.true&order=created_at.desc&limit=${limit}`,
    );
    return { rows: Array.isArray(rows) ? rows : [], source: 'view' };
  } catch (err) {
    console.log(
      `agent_bus_high_stakes_v not available yet (${err.message}) — falling back to client-side heuristic over agent_bus.`,
    );
  }

  try {
    const rows = await sb.sbSelect(
      'agent_bus',
      `status=eq.open&needs_answer=eq.true&order=created_at.desc&limit=${FALLBACK_SCAN_LIMIT}`,
    );
    const filtered = (Array.isArray(rows) ? rows : []).filter(computeHighStakesLocally).slice(0, limit);
    return { rows: filtered, source: 'heuristic-fallback' };
  } catch (err) {
    console.log(`agent_bus high-stakes fallback also failed: ${err.message}`);
    return { rows: [], source: 'error', error: err.message };
  }
}
