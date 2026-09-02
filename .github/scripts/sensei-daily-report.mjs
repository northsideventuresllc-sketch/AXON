#!/usr/bin/env node
/**
 * SENSEI Daily Report — AXON-side GitHub Actions job.
 * DRAFTED BY ARCEUS 2026-08-24, per Decision #1362. RunPod check rewired 2026-08-25.
 *
 * Three-part job:
 *   1. runpodBuildCheck()  — confirm the RunPod serverless endpoint AXON ships through is
 *                            reachable and has healthy workers.
 *   2. cronHealthCheck()   — confirm AXON's cron jobs (axon_cron_jobs table) are healthy.
 *   3. deliverReport()     — post the combined report to Slack #agent-ops.
 *
 * House rule this script follows (nvg-operator-core / critical-thinking): never fabricate a
 * pass. If a check can't actually run (missing secret, unreachable endpoint), it reports
 * NEEDS_CONFIG or ERROR, not "ok".
 *
 * Sets a GitHub Actions output `status` = ok | fail | needs_config, read by the workflow's
 * "fail if SENSEI found a real problem" step.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { postAgentOps } from '../../lib/slack-post.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — cannot run.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function ghOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) fs.appendFileSync(file, `${name}=${value}\n`);
}

/**
 * PART 1 — confirm the RunPod serverless endpoint AXON ships through is reachable and
 * has healthy workers.
 *
 * Rewired 2026-08-25: ARCEUS's original draft called RunPod's older Pods GraphQL API
 * (`pod(input:{podId:...})`), but the real secrets registered for AXON
 * (RUNPOD_AXON_V1_ENDPOINT / RUNPOD_AXON_V1_ENDPOINT_ID / RUNPOD_AXON_V1_KEY) are shaped
 * for RunPod Serverless Endpoints, not Pods. This now calls the Serverless health
 * endpoint instead.
 *
 * OPEN QUESTION (not resolved here, flagged for JB/ARCEUS): this confirms the endpoint is
 * reachable and its workers are healthy — it does NOT confirm "today's build" specifically
 * landed on it (RunPod Serverless doesn't expose an image-build timestamp this way). A
 * stronger signal — e.g. a heartbeat row RunPod writes to Supabase right after a
 * successful deploy — would need to be built separately. Until that exists, this check
 * reports endpoint/worker health only, and says so in its own detail text rather than
 * implying more than it verified.
 */
async function runpodBuildCheck() {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    return {
      status: 'needs_config',
      detail:
        'RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID not set on this repo — RunPod endpoint health ' +
        'check is not wired yet. Confirm RUNPOD_AXON_V1_KEY and RUNPOD_AXON_V1_ENDPOINT_ID ' +
        'are registered as GitHub Actions secrets on this repo (could not be confirmed from ' +
        'this session — no tool available here to list Actions secret names).',
    };
  }

  try {
    const res = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!res.ok) {
      return { status: 'error', detail: `RunPod health endpoint returned HTTP ${res.status}` };
    }
    const json = await res.json();
    const workers = json?.workers || {};
    const unhealthy = workers.unhealthy || 0;
    const capacity =
      (workers.ready || 0) + (workers.running || 0) + (workers.idle || 0) + (workers.initializing || 0);

    const status = unhealthy > 0 ? 'fail' : capacity > 0 ? 'ok' : 'fail';
    return {
      status,
      detail:
        `RunPod endpoint ${RUNPOD_ENDPOINT_ID} workers — ready:${workers.ready ?? 0} ` +
        `running:${workers.running ?? 0} idle:${workers.idle ?? 0} ` +
        `initializing:${workers.initializing ?? 0} unhealthy:${unhealthy}. ` +
        'This confirms the endpoint is reachable and workers are healthy — it does not ' +
        'confirm today\'s image build specifically landed (see OPEN QUESTION in source).',
    };
  } catch (err) {
    return { status: 'error', detail: `RunPod health check threw: ${err.message}` };
  }
}

/**
 * PART 2 — confirm AXON's cron jobs are healthy.
 * Real check, against the real axon_cron_jobs schema (id, enabled, last_run_at,
 * last_run_status, last_run_summary, next_run_at, warnings, updated_at).
 * A job is flagged if: enabled but last_run_status != 'ok', OR enabled with no
 * last_run_at in the last 36h (catches silent/stopped-firing jobs, the exact failure
 * class already caught twice this week for CONTENT/REACH — Decisions #1226 area).
 */
async function cronHealthCheck() {
  const { data, error } = await supabase
    .from('axon_cron_jobs')
    .select('id, enabled, last_run_at, last_run_status, next_run_at, warnings')
    .eq('enabled', true);

  if (error) {
    return { status: 'error', detail: `Could not read axon_cron_jobs: ${error.message}`, flagged: [] };
  }

  const now = Date.now();
  const STALE_MS = 36 * 60 * 60 * 1000; // 36h — one missed daily cycle + buffer
  const flagged = data.filter((row) => {
    const lastRunMs = row.last_run_at ? new Date(row.last_run_at).getTime() : 0;
    const stale = now - lastRunMs > STALE_MS;
    const failed = row.last_run_status && row.last_run_status !== 'ok';
    const hasWarnings = Array.isArray(row.warnings) && row.warnings.length > 0;
    return stale || failed || hasWarnings;
  });

  return {
    status: flagged.length > 0 ? 'fail' : 'ok',
    detail: flagged.length > 0
      ? `${flagged.length} enabled cron job(s) flagged: ${flagged.map((f) => f.id).join(', ')}`
      : `All ${data.length} enabled AXON cron jobs healthy (ran within 36h, status=ok, no warnings).`,
    flagged,
    total_checked: data.length,
  };
}

/**
 * PART 3 — deliver the report.
 * Posts to Slack #agent-ops via the shared lib/slack-post.mjs helper (the
 * slack-post Supabase edge function) — same mechanism every other AXON
 * script in this repo now uses for Slack delivery.
 */
async function deliverReport(runpod, cron) {
  const overallStatus =
    runpod.status === 'fail' || cron.status === 'fail'
      ? 'fail'
      : runpod.status === 'needs_config' || runpod.status === 'error' || cron.status === 'error'
        ? 'needs_config'
        : 'ok';

  const today = new Date().toISOString().slice(0, 10);
  const headline = `Daily Report ${today} — ${overallStatus.toUpperCase()}`;
  const body = [
    `*1. RunPod endpoint health:* ${runpod.status.toUpperCase()}`,
    `  ${runpod.detail}`,
    '',
    `*2. AXON cron health:* ${cron.status.toUpperCase()}`,
    `  ${cron.detail}`,
  ].join('\n');

  const result = await postAgentOps({ agentName: 'AXON Sensei', headline, body });
  if (!result.ok) {
    console.error(`Slack post failed: ${result.error || result.status}`);
  }

  console.log(`*AXON Sensei — ${headline}*\n${body}`);

  return overallStatus;
}

async function main() {
  const [runpod, cron] = await Promise.all([runpodBuildCheck(), cronHealthCheck()]);
  const overallStatus = await deliverReport(runpod, cron);
  ghOutput('status', overallStatus);
  if (overallStatus === 'fail') process.exitCode = 0; // report already posted; workflow step above decides exit code
}

main().catch((err) => {
  console.error('SENSEI daily report crashed:', err);
  ghOutput('status', 'error');
  process.exitCode = 1;
});
