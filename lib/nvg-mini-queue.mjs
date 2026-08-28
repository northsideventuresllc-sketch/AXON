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

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
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
  if (!supabaseKey || !cmd) return null;
  const timeoutS = opts.timeoutS ?? MINI_CMD_TIMEOUT_S;
  const maxWaitMs = opts.maxWaitMs ?? MINI_MAX_WAIT_MS;
  const title = opts.title ?? 'nvg-mini-shell';

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
      }),
    });
    if (!insertRes.ok) return null;
    const rows = await insertRes.json();
    jobId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  } catch {
    return null;
  }
  if (!jobId) return null;

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
      if (row.status === 'failed') return null;
      if (row.status !== 'done') continue;
      return row.result?.stdout || null;
    } catch {
      // transient poll error — keep trying until the deadline
    }
  }
  return null;
}
