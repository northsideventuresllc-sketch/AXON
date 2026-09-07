/**
 * RELAY-001-MEASUREMENT-BLIND-0901: the RELAY-001 benchmark reads nvg_mini_jobs for
 * relay signal, but nothing writes a single terminal row per attempt summarizing
 * success/duration across tiers (local mini + RunPod) -- callers only see the
 * per-attempt queue rows, not a scannable outcome. Log-only, best-effort: `status` is
 * always a terminal value ('done'/'failed'), never 'queued', so nvg-mini-runner.py
 * (which polls status='queued' unconditionally) never picks these rows up. Never
 * throws -- telemetry must not affect the caller's fallback chain.
 *
 * RELAY-95-HARDEN-0907: root cause of the 2026-09-05 -> 2026-09-07 measurement gap was
 * that the AXON Omni Router's locked LLM chain (lib/axon-router-core.mjs `axonGenerate` /
 * `executeChainTier`, shipped 2026-09-03 PR #155 and completed 2026-09-06 PR #179) became
 * the real call path for the 'local' and 'runpod' tiers -- replacing lib/axon-local-relay.mjs
 * and lib/axon-v1-cloud-relay.mjs as the thing that actually runs -- but the new path was
 * never wired to call logRelayMetric. It logs to axon_cost_ledger via recordLlmUsage
 * instead, a DIFFERENT table that answers a different question (cost/usage, not relay
 * success rate). nvg_mini_jobs kept receiving real 'shell' rows the whole time (title
 * axon-chain-local-<model>) -- the mini never stopped running jobs, only the
 * kind='relay_metric' summary row per attempt stopped being written. Fixed by having
 * axon-router-core.mjs call logRelayMetric for the 'local'/'runpod' tiers exactly as the
 * two files above always did. checkRelayHealthAlarm is new: a same-process, best-effort
 * hook so a success-rate drop under 95% posts to #agent-ops without needing a separate cron.
 */

import { postAgentOps } from './slack-post.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

/**
 * @param {string} supabaseKey
 * @param {{tier: string, success: boolean, durationMs: number}} info
 */
export async function logRelayMetric(supabaseKey, { tier, success, durationMs }) {
  if (!supabaseKey) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'relay_metric',
        title: `${tier}-relay-metric`,
        payload: { tier, success, duration_ms: durationMs },
        status: success ? 'done' : 'failed',
      }),
    });
  } catch {
    // best-effort telemetry -- never block or throw on the caller
  }
}

// RELAY-95-HARDEN-0907, part 2: alarm when the rolling relay success rate drops under 95%.
export const RELAY_ALARM_SUCCESS_FLOOR = 0.95;
export const RELAY_ALARM_MIN_SAMPLE = 5; // don't alarm off 1-2 noisy rows
const RELAY_ALARM_WINDOW_HOURS = 24;
const RELAY_ALARM_COOLDOWN_HOURS = 6; // don't re-post every single failed attempt

function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Best-effort, non-blocking: computes the trailing relay success rate and, if it has
 * dropped under RELAY_ALARM_SUCCESS_FLOOR (with a real sample size) and no alarm has
 * fired in the last RELAY_ALARM_COOLDOWN_HOURS, posts one #agent-ops alert and writes a
 * marker row (kind='relay_alarm') so the cooldown survives across process restarts.
 * Never throws -- call it fire-and-forget from any relay call site.
 * @param {string} supabaseKey
 * @returns {Promise<{fired: boolean, successRate: number|null, total: number}>}
 */
export async function checkRelayHealthAlarm(supabaseKey) {
  if (!supabaseKey) return { fired: false, successRate: null, total: 0 };
  try {
    const since = new Date(Date.now() - RELAY_ALARM_WINDOW_HOURS * 3600_000).toISOString();
    const rowsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/nvg_mini_jobs?select=status&kind=eq.relay_metric&created_at=gte.${since}`,
      { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
    );
    if (!rowsRes.ok) return { fired: false, successRate: null, total: 0 };
    const rows = await rowsRes.json();
    const total = rows.length;
    if (total < RELAY_ALARM_MIN_SAMPLE) return { fired: false, successRate: null, total };

    const successCount = rows.filter((r) => r.status === 'done').length;
    const successRate = successCount / total;
    if (successRate >= RELAY_ALARM_SUCCESS_FLOOR) return { fired: false, successRate, total };

    const cooldownSince = new Date(Date.now() - RELAY_ALARM_COOLDOWN_HOURS * 3600_000).toISOString();
    const recentAlarmRes = await fetch(
      `${SUPABASE_URL}/rest/v1/nvg_mini_jobs?select=id&kind=eq.relay_alarm&created_at=gte.${cooldownSince}&limit=1`,
      { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
    );
    const recentAlarm = recentAlarmRes.ok ? await recentAlarmRes.json() : [];
    if (recentAlarm.length > 0) return { fired: false, successRate, total };

    const pct = (successRate * 100).toFixed(1);
    await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: sbHeaders(supabaseKey),
      body: JSON.stringify({
        kind: 'relay_alarm',
        title: 'relay-success-rate-alarm',
        payload: { success_rate: successRate, total, window_hours: RELAY_ALARM_WINDOW_HOURS },
        status: 'done',
      }),
    });
    await postAgentOps({
      agentName: 'AXON Router',
      headline: `relay success rate ${pct}% over the last ${RELAY_ALARM_WINDOW_HOURS}h — under the 95% floor`,
      body: `${successCount}/${total} relay attempts (local + runpod) succeeded. Check nvg_mini_jobs kind=relay_metric and the mini heartbeat.`,
    }).catch(() => {});
    return { fired: true, successRate, total };
  } catch {
    return { fired: false, successRate: null, total: 0 };
  }
}
