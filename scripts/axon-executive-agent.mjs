#!/usr/bin/env node
/**
 * AXON EXECUTIVE AGENT — the nightly brain and cross-platform bridge for the
 * whole AXON system. Rebuild of AX-WISDOM-LOOP (2026-08-26, JB direct order):
 * everything the old wisdom-absorb loop did, still happens here unchanged
 * (via runWisdomAbsorbLoop) — this adds durable-signal ingest, git history,
 * a RunPod sync step, and the agent_bus/Slack/Telegram bridge on top.
 *
 * Usage:
 *   npm run exec-agent
 *   npm run exec-agent:dry
 *   AXON_DRY_RUN=1 node scripts/axon-executive-agent.mjs
 *   node scripts/axon-executive-agent.mjs --checklist
 *
 * Secrets (env wins over ni_platform_secrets):
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required for live persist
 *   GH_PAT — required for the git-history pull (falls back to skipped+logged)
 * Optional:
 *   ANTHROPIC_API_KEY — Haiku polish (off by default; pass --haiku)
 *   NV_VAULT_GIT_DIR — nv-vault checkout path for the training-bundle merge
 *     (defaults to ~/nv-vault); merge is skipped+logged if not reachable.
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { SUPABASE_URL } from '../lib/constants.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  WISDOM_ITEMS_TABLE,
  WISDOM_RUNS_TABLE,
} from '../lib/wisdom-absorb-loop.mjs';
import {
  getJspaceState,
  saveJspaceState,
} from '../lib/axon-j-space-core.mjs';
import {
  AGENT_NAME,
  NVG_REPOS,
  runWisdomAbsorbLoop,
  wisdomLoopChecklist,
  secret,
  fetchDurableSignals,
  fetchRecentCommits,
  mergeIntoTrainingBundle,
  uploadNewestModelToRunPod,
  readAgentBusInbox,
  markAgentBusHandled,
  postToAgentBus,
  postSlack,
  alertTelegramUrgent,
  checkTimeBudget,
  loadRunState,
  saveRunState,
  registerCron,
  CRON_JOB_ID,
} from '../lib/axon-executive-agent.mjs';

const START_MS = Date.now();
const dryRun = process.env.AXON_DRY_RUN === '1' || process.argv.includes('--dry');
const useHaiku = process.argv.includes('--haiku');
const showChecklist = process.argv.includes('--checklist');

async function upsertWisdomItems(sbSelect, sbInsert, sbPatch, rows) {
  const out = [];
  for (const row of rows) {
    const existing = await sbSelect(
      WISDOM_ITEMS_TABLE,
      `operator_id=eq.${encodeURIComponent(row.operator_id)}&fingerprint=eq.${encodeURIComponent(row.fingerprint)}&select=id,salience&limit=1`,
    );
    if (existing?.length) {
      const prev = existing[0];
      const patched = await sbPatch(WISDOM_ITEMS_TABLE, `id=eq.${prev.id}`, {
        title: row.title,
        principle: row.principle,
        application: row.application,
        domain: row.domain,
        source_type: row.source_type,
        source_ref: row.source_ref,
        confidence: row.confidence,
        salience: Math.max(Number(prev.salience) || 0, row.salience),
        status: 'absorbed',
        meta: row.meta,
        absorbed_at: row.absorbed_at,
        updated_at: row.updated_at,
      });
      out.push(patched);
    } else {
      out.push(await sbInsert(WISDOM_ITEMS_TABLE, row));
    }
  }
  return out;
}

async function main() {
  if (showChecklist) {
    console.log('Mac checklist — AXON EXECUTIVE AGENT\n');
    for (const [i, line] of wisdomLoopChecklist().entries()) {
      console.log(`${i + 1}. ${line}`);
    }
    console.log(`${wisdomLoopChecklist().length + 1}. Confirm GH_PAT is set for the git-history pull.`);
    console.log(`${wisdomLoopChecklist().length + 2}. Confirm RUNPOD_AXON_V1_KEY/RUNPOD_AXON_V1_ENDPOINT_ID for the RunPod sync step (best-effort, logs and continues if missing).`);
    return;
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

  let sbSelect = null;
  let sbInsert = null;
  let sbPatch = null;
  let corpus = [];
  let findings = [];
  let learnings = [];
  let signals = [];
  let jspaceState = null;
  let anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const loopNotes = []; // loop-engineering: what worked / what didn't, this run

  if (serviceKey) {
    const client = createSupabaseClient(serviceKey);
    sbSelect = client.sbSelect;
    sbInsert = client.sbInsert;
    sbPatch = client.sbPatch;

    if (await cronGuardShouldSkip(CRON_JOB_ID, sbSelect)) return;
    if (!anthropicKey) anthropicKey = await secret(sbSelect, 'ANTHROPIC_API_KEY');

    try {
      [corpus, findings, learnings, signals, jspaceState] = await Promise.all([
        sbSelect(
          'axon_nd_research_corpus',
          'select=external_id,domain,title,key_finding,axon_application,confidence,source_type,year&order=updated_at.desc.nullslast&limit=40',
        ),
        sbSelect(
          'axon_research_findings',
          'select=id,research_lane,title,summary,implementation_hint,priority,status,jspace_relevance,brain_gap_category&order=created_at.desc&limit=30',
        ),
        sbSelect(
          'Learnings',
          'project=eq.AXON&select=id,learning,source,category,project,date&order=date.desc.nullslast&limit=40',
        ),
        sbSelect(
          'axon_communication_signals',
          'select=id,signal_type,signal_key,signal_value,evidence_count,weight&order=last_reinforced_at.desc.nullslast&limit=30',
        ),
        getJspaceState(sbSelect, 'default'),
      ]);
      loopNotes.push('NI-Brain core reads: ok');
    } catch (err) {
      console.warn('NI-Brain read failed — continuing with empty corpus:', err.message);
      loopNotes.push(`NI-Brain core reads: FAILED (${err.message})`);
    }
  } else if (!dryRun) {
    console.warn('No SUPABASE_SERVICE_KEY — forcing dry-run (no persist).');
  }

  const effectiveDry = dryRun || !serviceKey;

  // --- existing wisdom-absorb behavior, unchanged ---
  const result = await runWisdomAbsorbLoop({
    corpus: corpus || [],
    findings: findings || [],
    learnings: learnings || [],
    signals: signals || [],
    jspaceState,
    dryRun: effectiveDry,
    forceHeuristic: !useHaiku,
    anthropicKey,
    persistItems: async (rows) => upsertWisdomItems(sbSelect, sbInsert, sbPatch, rows),
    persistRun: async (record) => sbInsert(WISDOM_RUNS_TABLE, record),
    persistJspace:async (state) => saveJspaceState(sbInsert, sbPatch, state, 'default', sbSelect),
  });

  // --- 1. durable Decisions/Learnings + git history across NVG repos ---
  const durable = await fetchDurableSignals(sbSelect);
  loopNotes.push(
    durable.error
      ? `Durable Decisions/Learnings pull: FAILED (${durable.error})`
      : `Durable Decisions/Learnings pull: ok (${durable.durableDecisions.length} decisions, ${durable.durableLearnings.length} learnings)`,
  );

  const ghToken = await secret(sbSelect, 'GH_PAT');
  const commitsResult = await fetchRecentCommits(ghToken, { repos: NVG_REPOS, sinceHours: 24 });
  const commitRepoFailures = (commitsResult.commits || []).filter((c) => !c.ok);
  loopNotes.push(
    commitsResult.reachable
      ? `Git history pull: ok (${commitsResult.commits.length - commitRepoFailures.length}/${commitsResult.commits.length} repos, ${commitRepoFailures.length} failed)`
      : `Git history pull: SKIPPED (${commitsResult.reason})`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const vaultRoot = process.env.NV_VAULT_GIT_DIR || `${process.env.HOME}/nv-vault`;
  let bundleMerge = { skipped: true, reason: 'dry-run' };
  if (!effectiveDry) {
    bundleMerge = mergeIntoTrainingBundle({
      vaultRoot,
      date: today,
      durableDecisions: durable.durableDecisions,
      durableLearnings: durable.durableLearnings,
      commitsResult,
      researchFindings: (findings || []).slice(0, 15),
    });
  }
  loopNotes.push(
    bundleMerge.skipped
      ? `Training-bundle merge: SKIPPED (${bundleMerge.reason})`
      : `Training-bundle merge: ok (+${bundleMerge.learningsAdded} learnings, +${bundleMerge.decisionsAdded} decisions -> ${bundleMerge.jsonPath})`,
  );

  // --- 3. agent_bus bridge: read anything addressed to us, process, close the loop ---
  const inbox = await readAgentBusInbox(sbSelect);
  const inboxSummaries = [];
  if (!effectiveDry) {
    for (const msg of inbox) {
      inboxSummaries.push({ from: msg.from_agent, subject: msg.subject });
      await markAgentBusHandled(sbPatch, msg.id);
    }
  }
  loopNotes.push(`agent_bus inbox: ${inbox.length} message(s) addressed to ${AGENT_NAME}${effectiveDry ? ' (dry-run, not marked handled)' : ''}`);

  // --- 2. RunPod — best-effort manifest sync, end of run, never hard-fails ---
  let runpod = { attempted: false, ok: false, reason: 'dry-run' };
  if (!effectiveDry) {
    runpod = await uploadNewestModelToRunPod(sbSelect);
  }
  loopNotes.push(
    runpod.attempted
      ? `RunPod sync: ${runpod.ok ? 'ok' : `FAILED (${runpod.reason})`}`
      : `RunPod sync: SKIPPED (${runpod.reason})`,
  );

  // --- 4. time budget / self-checkpoint ---
  const budget = checkTimeBudget(START_MS);
  const state = loadRunState();

  const summaryLine = result.ok
    ? `${result.dryRun ? 0 : result.itemRows.length} absorbed, ${result.digested.length} digested (${result.provider})`
    : `run failed: ${result.summary || 'unknown error'}`;

  const runRecord = {
    date: today,
    startedAt: new Date(START_MS).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: budget.elapsedMs,
    overBudget: budget.overBudget,
    dryRun: effectiveDry,
    summary: summaryLine,
    durableDecisions: durable.durableDecisions.length,
    durableLearnings: durable.durableLearnings.length,
    gitReposScanned: commitsResult.commits?.length || 0,
    gitReposFailed: commitRepoFailures.length,
    bundleMerge,
    inboxProcessed: inbox.length,
    runpod,
    loopNotes,
  };
  state.runs = state.runs || [];
  state.runs.push(runRecord);
  if (!effectiveDry) saveRunState(state);

  // --- Slack + agent_bus outbound — the human/agent-facing wrap for this run ---
  const slackHeadline = `nightly run ${today}`;
  const plainSummary =
    `• Wisdom: ${summaryLine}\n` +
    `• Durable signals: ${durable.durableDecisions.length} decisions, ${durable.durableLearnings.length} learnings\n` +
    `• Git history: ${commitsResult.commits?.length ? `${commitsResult.commits.length - commitRepoFailures.length}/${commitsResult.commits.length} repos ok` : 'skipped'}\n` +
    `• RunPod sync: ${runpod.attempted ? (runpod.ok ? 'ok' : `failed — ${runpod.reason}`) : `skipped — ${runpod.reason}`}\n` +
    `• Bus inbox: ${inbox.length} message(s) processed` +
    (budget.overBudget ? `\n⏳ Hit its time-box this run — resuming within ~12h, not waiting for the full 24h.` : '');

  if (!effectiveDry) {
    const slackResult = await postSlack(slackHeadline, plainSummary);
    loopNotes.push(`Slack post: ${slackResult.ok ? 'ok' : `FAILED (${slackResult.error || slackResult.status})`}`);

    await postToAgentBus(sbInsert, {
      to_agent: 'ALL',
      subject: `AXON-EXEC-AGENT-NIGHTLY-${today}`,
      body: {
        kind: 'executive_agent_nightly_summary',
        date: today,
        plain_english_summary: plainSummary,
        loop_engineering_notes: loopNotes,
        inbox_processed: inboxSummaries,
      },
      needs_answer: false,
    });

    // Urgent JB alert ONLY on a genuinely bad run (not routine — Slack covers routine;
    // RunPod being unreachable alone is explicitly NOT urgent per JB's scope note).
    if (!result.ok) {
      await alertTelegramUrgent(
        sbSelect,
        `🚨 AXON Executive Agent nightly run had a real problem: ${result.summary || 'unknown error'}. Check Slack #agent-ops for the full wrap.`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        dryRun: effectiveDry,
        provider: result.provider,
        watched: result.watchedCount,
        digested: result.digested.length,
        enhanced: result.enhancement.enhancedCount,
        absorbed: result.dryRun ? 0 : result.itemRows.length,
        summary: summaryLine,
        durableDecisions: durable.durableDecisions.length,
        durableLearnings: durable.durableLearnings.length,
        gitHistory: commitsResult.reachable ? `${commitsResult.commits.length} repos scanned` : commitsResult.reason,
        bundleMerge,
        inboxProcessed: inbox.length,
        runpod,
        overBudget: budget.overBudget,
        brain: SUPABASE_URL,
      },
      null,
      2,
    ),
  );

  if (effectiveDry) {
    console.log('\n[DRY RUN] No rows written, no Slack/Telegram/agent_bus/RunPod calls made.');
    console.log('Tip: npm run exec-agent:dry  |  npm run exec-agent -- --checklist');
  } else {
    const registered = await registerCron(serviceKey, {
      status: result.ok ? 'ok' : 'error',
      summary: summaryLine,
      overBudget: budget.overBudget,
    });
    console.log(registered ? '[axon_cron_jobs] registered run.' : '[axon_cron_jobs] registration skipped/failed — see warning above.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
