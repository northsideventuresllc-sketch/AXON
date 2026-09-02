#!/usr/bin/env node
/**
 * AXON-ARCEUS v1 — AXON registry consistency checker (read-only / propose-only).
 *
 * Usage:
 *   node scripts/axon-arceus-registry-check.mjs
 *   node scripts/axon-arceus-registry-check.mjs --dry     (print only, no writes anywhere)
 *   AXON_DRY_RUN=1 node scripts/axon-arceus-registry-check.mjs
 *
 * Secrets (env wins over ni_platform_secrets):
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required
 *   GH_PAT — optional, raises the GitHub PR-lookup rate limit; works unauthenticated too
 *
 * Scope, deliberately narrow for v1 (see the PR description and the Decision
 * logged alongside it): this script only READS axon_cron_jobs and
 * nvg_agent_routines and never writes to either. It never touches any
 * agent's active/enabled flag, permissions, or merge/deploy rights. Its only
 * writes are: one agent_bus row, one Slack post, and — only on a hard
 * failure of the run itself — one Telegram alert. Findings are proposals
 * for a human to act on, not actions taken.
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import {
  fetchAxonCronJobs,
  fetchAxonRoutines,
  diffRegistry,
  buildReport,
  registerSelfRun,
  postToAgentBus,
  postSlack,
  alertTelegramUrgent,
  SELF_ROUTINE_ID,
  TIME_BUDGET_MS,
} from '../lib/axon-arceus-core.mjs';

const dryRun = process.env.AXON_DRY_RUN === '1' || process.argv.includes('--dry');

async function secret(sbSelect, key) {
  if (process.env[key]?.trim()) return process.env[key].trim();
  const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  return rows?.[0]?.value?.trim() || '';
}

async function main() {
  const startedAt = Date.now();
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) {
    console.error('axon-arceus: missing SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — cannot run.');
    process.exitCode = 1;
    return;
  }
  const { sbSelect, sbInsert } = createSupabaseClient(serviceKey);
  const ghToken = process.env.GH_PAT?.trim() || (await secret(sbSelect, 'GH_PAT'));

  try {
    console.log(`[axon-arceus] ${dryRun ? 'DRY RUN — ' : ''}reading axon_cron_jobs + nvg_agent_routines...`);
    const [cronJobs, routines] = await Promise.all([
      fetchAxonCronJobs(sbSelect),
      fetchAxonRoutines(sbSelect),
    ]);
    console.log(`[axon-arceus] axon_cron_jobs: ${cronJobs.length} rows | nvg_agent_routines (axon): ${routines.length} rows`);

    const diff = await diffRegistry({ cronJobs, routines, ghToken, timeBudgetMs: TIME_BUDGET_MS });

    // Loop-engineering: don't re-shout the same finding every run. Previous
    // finding ids live in this job's own axon_cron_jobs.warnings column.
    let previousFindingIds = [];
    try {
      const prevRows = await sbSelect('axon_cron_jobs', `id=eq.${SELF_ROUTINE_ID}&select=warnings&limit=1`);
      previousFindingIds = Array.isArray(prevRows?.[0]?.warnings) ? prevRows[0].warnings : [];
    } catch {
      // no prior row yet — first run, nothing to compare against
    }

    const report = buildReport({ diff, previousFindingIds });
    console.log('\n' + report.text + '\n');

    const findingIds = diff.findings.map((f) => f.id);
    const elapsedMs = Date.now() - startedAt;
    const overBudget = elapsedMs > TIME_BUDGET_MS;

    if (dryRun) {
      console.log('[axon-arceus] DRY RUN — no self-registration, no agent_bus, no Slack, no Telegram.');
      return;
    }

    await registerSelfRun(serviceKey, {
      status: 'ok',
      summary: `${diff.findings.length} finding(s), ${report.newCount} new. v1 read-only/propose-only.`,
      findingIds,
    });

    await postToAgentBus(sbInsert, {
      subject: `AXON-ARCEUS-REGISTRY-CHECK-${diff.generatedAt.slice(0, 10)}`,
      body: {
        kind: 'axon_arceus_registry_check',
        generated_at: diff.generatedAt,
        plain_english_summary: report.text,
        findings: diff.findings,
        new_count: report.newCount,
        still_open_count: report.stillOpenCount,
        notes: diff.notes,
        v1_scope_note: 'Read-only / propose-only. Does not grant, revoke, or change any agent authority, and does not activate anything.',
      },
      needsAnswer: report.newCount > 0,
    });

    const slackResult = await postSlack(report.headline, report.text);
    if (!slackResult.ok) {
      console.error(`[axon-arceus] Slack post failed: HTTP ${slackResult.status}`);
    }

    if (overBudget) {
      console.warn('[axon-arceus] Hit its soft time budget this run — needs to resume within ~12h to finish anything left unchecked.');
    }

    console.log(`[axon-arceus] Done. ${diff.findings.length} total finding(s), ${report.newCount} new this run.`);
  } catch (err) {
    console.error('[axon-arceus] run failed:', err);
    if (!dryRun) {
      await registerSelfRun(serviceKey, {
        status: 'error',
        summary: `Run failed: ${err.message}`.slice(0, 500),
        findingIds: [],
      }).catch(() => {});
      await alertTelegramUrgent(
        sbSelect,
        `🚨 AXON-ARCEUS registry check crashed: ${err.message}. It's read-only so nothing else was affected, but the check itself needs a look.`,
      ).catch(() => {});
    }
    process.exitCode = 1;
  }
}

main();
