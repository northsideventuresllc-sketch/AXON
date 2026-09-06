/**
 * AX-FIRE-DISPATCH-CONSUMER — pure core for the fire-request acknowledgement note.
 *
 * Split out from scripts/axon-fire-dispatch-consumer.mjs so the message logic
 * is testable without a live Supabase client, same pattern as axon-cron-guard.mjs
 * and the other lib/*-core.mjs modules in this repo.
 */

/**
 * Build the note written back onto a manual_fire_requests row once it's
 * acknowledged. Does not claim to have executed anything itself — the
 * continuous local_ollama runner (nvg-dispatch-local-runner-v2.py, mac mini
 * launchd) already drains agent_dispatch on its own poll loop regardless of
 * any manual fire, so this consumer's real job is closing the loop: prove a
 * FIRE press was seen and report what it was waiting on at that moment.
 */
export function buildFireAckNote({ source, queuedCount, nowIso }) {
  const src = source && source.trim() ? source.trim() : 'unknown source';
  return (
    `[axon-fire-dispatch-consumer ${nowIso}] Acknowledged fire from "${src}". ` +
    `${queuedCount} agent_dispatch row(s) were queued for the continuous local_ollama ` +
    `runner (nvg-dispatch-local-runner-v2.py) at pickup time -- that runner drains the ` +
    `queue continuously already, independent of this fire press; this consumer's job is ` +
    `only to close the fire-request loop so a press is never silently dropped again.`
  );
}

/**
 * Claim-and-close loop, split out of scripts/axon-fire-dispatch-consumer.mjs so
 * it's testable against a fake sbSelect/sbPatch (same DI shape as
 * axon-cron-guard.mjs) instead of only via the pure buildFireAckNote() message
 * helper -- council stress-test finding 2026-09-05: nothing exercised the
 * actual claimed+closed flow against a manual_fire_requests row.
 *
 * Returns { acked, raced, total } instead of doing its own logging so callers
 * (the script, or a test) decide what to do with the outcome.
 */
export async function processFireRequests({ sbSelect, sbPatch, nowIso, maxPerRun = 20 }) {
  const requests = await sbSelect(
    'manual_fire_requests',
    `status=eq.queued&order=requested_at.asc&limit=${maxPerRun}&select=id,source,requested_at,note`,
  );

  if (!requests.length) {
    return { acked: 0, raced: 0, total: 0 };
  }

  const queueRows = await sbSelect(
    'agent_dispatch',
    'status=eq.queued&executor=eq.local_ollama&select=id',
  );
  const queuedCount = queueRows.length;

  let acked = 0;
  let raced = 0;
  for (const req of requests) {
    // Atomic claim: the status=eq.queued filter on the PATCH means a
    // concurrent run that already claimed this row gets zero rows back here,
    // same guard shape as nvg-dispatch-local-runner-v2.py's claim_next().
    const picked = await sbPatch(
      'manual_fire_requests',
      `id=eq.${req.id}&status=eq.queued`,
      { status: 'processing', picked_up_at: nowIso() },
    );
    if (!picked) {
      raced += 1;
      continue;
    }

    const note = buildFireAckNote({ source: req.source, queuedCount, nowIso: nowIso() });
    await sbPatch('manual_fire_requests', `id=eq.${req.id}`, { status: 'done', completed_at: nowIso(), note });
    acked += 1;
  }

  return { acked, raced, total: requests.length };
}
