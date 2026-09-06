#!/usr/bin/env node
/**
 * AX-FIRE-DISPATCH-CONSUMER — watch manual_fire_requests for new rows and
 * close the loop: "FIRE buttons on axon-report + nvg-today-board insert rows
 * but nothing consumes them yet" (flagged 2026-08-05, ticket
 * AX-FIRE-DISPATCH-CONSUMER, agent_dispatch id c811ee3e-...).
 *
 * Scope note (2026-09-05 BUILD session): per-ticket execution + tiered model
 * fan-out (AXON-local -> RunPod -> Gemini -> Anthropic) already runs
 * continuously via nvg-dispatch-local-runner-v2.py (mac mini launchd, polls
 * agent_dispatch on its own loop regardless of any manual fire). A FIRE press
 * does not need a second, duplicate executor built on top of that. What was
 * actually missing is acknowledgement: pressing FIRE wrote a manual_fire_requests
 * row and nothing ever closed it, so a press was silently dropped. This job is
 * that close — see lib/axon-fire-dispatch-consumer-core.mjs for the note text.
 *
 * Scheduling: per Decision #1699 (BUILD-A1-NO-GH-SCHEDULES-0902), new
 * recurring jobs are NOT wired via a GitHub Actions `schedule:` trigger —
 * they're registered in NI-Brain `nvg_agent_routines` (harness='mac_mini')
 * and picked up by the mini's own cron dispatcher. This script only exists
 * here + as a workflow_dispatch (manual/on-demand) entrypoint.
 *
 * Usage:
 *   node scripts/axon-fire-dispatch-consumer.mjs
 *
 * Env: SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY (NI-Brain).
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { processFireRequests } from '../lib/axon-fire-dispatch-consumer-core.mjs';

const JOB_ID = 'axon-fire-dispatch-consumer';
const MAX_REQUESTS_PER_RUN = 20;

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  console.log(`AXON Fire Dispatch Consumer — ${nowIso()}`);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
  const sb = createSupabaseClient(key);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const { acked, raced, total } = await processFireRequests({
    sbSelect: sb.sbSelect,
    sbPatch: sb.sbPatch,
    nowIso,
    maxPerRun: MAX_REQUESTS_PER_RUN,
  });

  if (!total) {
    console.log('No queued manual_fire_requests — nothing to consume.');
    return;
  }

  console.log(
    `AXON Fire Dispatch Consumer complete — acknowledged=${acked} raced=${raced} of ${total} request(s).`,
  );
}

main().catch((err) => {
  console.error('AXON Fire Dispatch Consumer failed:', err);
  process.exitCode = 1;
});
