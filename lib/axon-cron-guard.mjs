/**
 * AXON cron enforcement gate — FIX-AXON-CRON-ENABLED-OVERWRITE-0817 (2 of 2).
 *
 * Fix (1) stopped the (since-retired) wisdom-loop entrypoint's upsert from clobbering enabled=false
 * (PR #105, bedc119). This is fix (2): each scheduled workflow entrypoint now
 * reads axon_cron_jobs.enabled itself, BEFORE doing real work, and no-ops
 * cleanly if JB has frozen the job — instead of relying only on the GitHub
 * Actions schedule toggle (which axon-cron-service.ts already flips, but a
 * manual `gh workflow run` / stale schedule state can still slip past that).
 *
 * Fail-open by design: a missing row or a transient Supabase error means the
 * job runs. Matches the dashboard's own read (`row?.enabled ?? def.defaultEnabled`
 * in lib/axon-cron-service.ts) — an unseeded row should never silently kill a
 * job that's supposed to run, and a DB blip shouldn't either.
 */
export async function isCronJobEnabled(jobId, sbSelect) {
  try {
    const rows = await sbSelect('axon_cron_jobs', `id=eq.${jobId}&select=enabled&limit=1`);
    if (!rows || rows.length === 0) return true;
    return rows[0].enabled !== false;
  } catch (err) {
    console.error(`axon-cron-guard: enabled check failed for "${jobId}" — fail-open (${err.message})`);
    return true;
  }
}

/**
 * Call at the top of main(), right after the Supabase client exists.
 * Returns true when the caller should no-op and return. Logs either way.
 */
export async function cronGuardShouldSkip(jobId, sbSelect) {
  const enabled = await isCronJobEnabled(jobId, sbSelect);
  if (!enabled) {
    console.log(
      `AXON cron guard: "${jobId}" is disabled in axon_cron_jobs (enabled=false) — no-op, exiting clean.`,
    );
  }
  return !enabled;
}
