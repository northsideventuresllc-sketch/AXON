/**
 * RELAY-001-MEASUREMENT-BLIND-0901: the RELAY-001 benchmark reads nvg_mini_jobs for
 * relay signal, but nothing writes a single terminal row per attempt summarizing
 * success/duration across tiers (local mini + RunPod) -- callers only see the
 * per-attempt queue rows, not a scannable outcome. Log-only, best-effort: `status` is
 * always a terminal value ('done'/'failed'), never 'queued', so nvg-mini-runner.py
 * (which polls status='queued' unconditionally) never picks these rows up. Never
 * throws -- telemetry must not affect the caller's fallback chain.
 */

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
