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
