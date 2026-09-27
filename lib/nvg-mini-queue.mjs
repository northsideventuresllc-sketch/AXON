/**
 * Shared Mac-mini shell relay.
 *
 * Extracted verbatim from lib/axon-local-relay.mjs so that BOTH the Ollama lane and the
 * subscription-CLI lanes ride the same proven transport (nvg_mini_jobs, polled by
 * nvg-mini-runner.py on the mini — live since 2026-08-05, Decision #599). Reuse the
 * transport; do not invent a second one.
 *
 * Contract: returns the job's stdout string, or null on any failure/timeout. Never throws,
 * so callers can fall through to the next lane.
 */

import {
  classifyMiniShellRiskTier,
  blockUnclassifiedMiniShellJob,
  routeMiniShellJobToCouncil,
} from './nvg-mini-risk-gate.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

// AX-ROUTER-LOG-FAILURES-0906 (Build Plan A ticket A7): this module's public contract
// (return the job's stdout string, or null) is relied on by every caller as "fall through
// to the next lane" — changing it to {ok:false, reason} here would ripple into every lane
// executor. Instead, every catch below that used to swallow silently now logs one
// structured line with a reason before returning null, so a mini-relay failure is
// greppable from plain server logs instead of only showing up as "no reply".
function logMiniQueueEvent(event, fields = {}) {
  try {
    console.error(JSON.stringify({ at: 'nvg-mini-queue', event, ...fields }));
  } catch {
    console.error(`[nvg-mini-queue] ${event}`, fields);
  }
}
export const MINI_MAX_WAIT_MS = 45_000;
export const MINI_POLL_MS = 2_500;
export const MINI_CMD_TIMEOUT_S = 40;

export function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Queue a shell command on the Mac mini and wait for its stdout.
 * @param {string} supabaseKey
 * @param {string} cmd
 * @param {{title?: string, timeoutS?: number, maxWaitMs?: number}} [opts]
 * @returns {Promise<string|null>} stdout, or null on failure/timeout
 */
export async function queueMiniShellJob(supabaseKey, cmd, opts = {}) {
  const out = await queueMiniShellJobDetailed(supabaseKey, cmd, opts);
  return out.stdout;
}

/**
 * Same transport as queueMiniShellJob, but tells the caller WHY there is no stdout.
 * AG-VERIFY-CHAIN-EXHAUSTION-0924: the NI-Brain insert trigger
 * (fn_gate_mini_job_before_insert) can flip a queued job straight to 'blocked_needs_jb'
 * (AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917 — e.g. a prompt that mentions payments). The poll
 * loop below used to treat that status like "still queued" and wait out the whole
 * maxWaitMs (130s for the local chain tier) before reporting "no response", and the chain
 * then retried and got blocked AGAIN — two JB approval cards and ~260s lost per call.
 * A blocked job is terminal: report it at once so the chain can fall through immediately.
 * The gate policy itself is untouched.
 *
 * @returns {Promise<{stdout: string|null, blocked: boolean, reason: string|null}>}
 */
export async function queueMiniShellJobDetailed(supabaseKey, cmd, opts = {}) {
  const none = (reason, blocked = false) => ({ stdout: null, blocked, reason });
  if (!supabaseKey || !cmd) return none('missing supabase key or cmd');
  const timeoutS = opts.timeoutS ?? MINI_CMD_TIMEOUT_S;
  const maxWaitMs = opts.maxWaitMs ?? MINI_MAX_WAIT_MS;
  const title = opts.title ?? 'nvg-mini-shell';

  // AX-MINI-JOBS-NO-TIER-GATE-0813: classify BEFORE this job is ever written with
  // status:'queued' -- that status is exactly what nvg-mini-runner.py polls for and runs
  // unconditionally. COUNCIL-DECIDED 2026-09-25 (supersedes the original EXEC binary
  // design): allowlisted read-only commands auto-run (low); anything that writes or
  // installs goes to COUNCIL review (medium), not JB; deletes/paid installs/secrets/fully
  // unmatched payloads go to JB (high) -- unchanged from the original design.
  const { tier, route, reason: riskReason } = classifyMiniShellRiskTier(cmd);
  if (route === 'jb') {
    await blockUnclassifiedMiniShellJob(supabaseKey, { title, cmd, riskFlag: 'high', riskReason });
    return none(`blocked before queueing (JB): ${riskReason}`, true); // caller falls through
  }
  if (route === 'council') {
    await routeMiniShellJobToCouncil(supabaseKey, { title, cmd, reason: riskReason });
    return none(`held for COUNCIL review before queueing: ${riskReason}`, true); // caller falls through
  }
  const riskFlag = tier; // 'low'

  let jobId = null;
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: { ...sbHeaders(supabaseKey), Prefer: 'return=representation' },
      body: JSON.stringify({
        kind: 'shell',
        title,
        payload: { cmd, timeout: timeoutS + 5 },
        status: 'queued',
        risk_flag: riskFlag,
        risk_reason: riskReason,
      }),
    });
    if (!insertRes.ok) {
      logMiniQueueEvent('insert_job_failed', { title, status: insertRes.status });
      return none(`insert failed (HTTP ${insertRes.status})`);
    }
    const rows = await insertRes.json();
    jobId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  } catch (err) {
    logMiniQueueEvent('insert_job_threw', { title, reason: String(err?.message || err).slice(0, 300) });
    return none('insert threw');
  }
  if (!jobId) {
    logMiniQueueEvent('insert_job_no_id', { title });
    return none('insert returned no id');
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, MINI_POLL_MS));
    try {
      const pollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/nvg_mini_jobs?id=eq.${jobId}&select=status,result,error`,
        { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
      );
      if (!pollRes.ok) continue;
      const row = (await pollRes.json())?.[0];
      if (!row) continue;
      if (row.status === 'failed') {
        logMiniQueueEvent('job_failed', { title, jobId, error: row.error });
        return none(`job failed: ${row.error || 'unknown'}`);
      }
      if (row.status === 'blocked_needs_jb') {
        logMiniQueueEvent('job_blocked_by_gate', { title, jobId });
        return none('blocked by the mini safety gate (needs JB approval)', true);
      }
      if (row.status !== 'done') continue;
      return { stdout: row.result?.stdout || null, blocked: false, reason: row.result?.stdout ? null : 'empty stdout' };
    } catch (err) {
      // transient poll error — keep trying until the deadline, but don't swallow it silently
      logMiniQueueEvent('poll_threw', { title, jobId, reason: String(err?.message || err).slice(0, 300) });
    }
  }
  logMiniQueueEvent('job_timed_out', { title, jobId, maxWaitMs });
  return none(`timed out after ${maxWaitMs}ms`);
}
