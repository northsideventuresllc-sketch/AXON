/**
 * Shared Supabase job-queue plumbing for the Mac-mini relay (nvg_mini_jobs).
 *
 * Extracted 2026-08-26 from axon-local-relay.mjs so a second caller (the computer-use
 * action executor) doesn't duplicate the enqueue/poll fetch logic. axon-local-relay.mjs
 * now calls these two functions instead of hand-rolling its own — same requests, same
 * headers, same return shape, so its existing callers see no behavior change.
 *
 * The mini's job runner (source lives only on the physical machine, not in this repo)
 * is kind-agnostic — it shell-execs `payload.cmd` regardless of `kind`, writing back
 * status/result/error. Every caller here just picks a `kind` label for the job title/
 * audit trail; it has no effect on execution.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Enqueue a shell job on the mini. Returns the job id, or null on any failure
 * (missing key, insert error, malformed response) so callers can fail soft.
 * @param {string} supabaseKey
 * @param {{ title: string, cmd: string, timeout: number, kind?: string }} job
 * @returns {Promise<string|null>}
 */
export async function enqueueMiniShellJob(supabaseKey, { title, cmd, timeout, kind = 'shell' }) {
  if (!supabaseKey) return null;
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: { ...sbHeaders(supabaseKey), Prefer: 'return=representation' },
      body: JSON.stringify({
        kind,
        title,
        payload: { cmd, timeout },
        status: 'queued',
      }),
    });
    if (!insertRes.ok) return null;
    const rows = await insertRes.json();
    const jobId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
    return jobId || null;
  } catch {
    return null;
  }
}

/**
 * Poll a mini job until it reaches a terminal state or the deadline passes.
 * @param {string} supabaseKey
 * @param {string} jobId
 * @param {{ maxWaitMs: number, pollMs: number }} opts
 * @returns {Promise<{ status: 'done'|'failed'|'timeout', result?: any, error?: any }>}
 */
export async function pollMiniJob(supabaseKey, jobId, { maxWaitMs, pollMs }) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    try {
      const pollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/nvg_mini_jobs?id=eq.${jobId}&select=status,result,error`,
        { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
      );
      if (!pollRes.ok) continue;
      const rows = await pollRes.json();
      const row = rows?.[0];
      if (!row) continue;

      if (row.status === 'failed') return { status: 'failed', error: row.error };
      if (row.status === 'done') return { status: 'done', result: row.result };
      // still queued/running — keep polling
    } catch {
      // transient poll error — keep trying until deadline
    }
  }
  return { status: 'timeout' };
}
