/**
 * AXON DROID LIVE VIEW (2026-09-21, BUILD-AXON-DROID-AGENT-0920 — live-screen-streaming
 * slice) — a single upserted row per computer-use run in axon_droid_live_frames, so a
 * caller can poll for the current screenshot/step/status of an in-progress
 * runComputerUseTask() session instead of only seeing the final Learnings write once the
 * whole task ends. This is deliberately the smallest real piece of the three-part ticket
 * title ("Ghost Desktop runner, credential vault & live screen streaming"): it adds
 * observability to the existing single-machine runner (lib/axon-computer-use.mjs) and
 * touches no credentials and no new sandboxing/isolation model. The Ghost Desktop
 * (isolated runner distinct from JB's live physical session) and credential vault pieces
 * are architecturally separate decisions — deferred, not attempted here — see the
 * companion NI-Brain Decision this PR's description links to.
 */

import { createSupabaseClient } from './supabase.mjs';

/** Insert-or-update the live-view row for one run. Never throws — a live-view write
 *  failure must not interrupt or fail the underlying computer-use task. */
export async function upsertLiveFrame(supabaseKey, runId, patch) {
  try {
    const { sbUpsert } = createSupabaseClient(supabaseKey);
    await sbUpsert('axon_droid_live_frames', {
      run_id: runId,
      updated_at: new Date().toISOString(),
      ...patch,
    });
    return true;
  } catch {
    return false;
  }
}

/** Fetch the current live-view row for one run, or null if none exists yet. */
export async function getLiveFrame(supabaseKey, runId) {
  const { sbSelect } = createSupabaseClient(supabaseKey);
  const rows = await sbSelect('axon_droid_live_frames', `run_id=eq.${encodeURIComponent(runId)}&limit=1`);
  return rows?.[0] || null;
}
