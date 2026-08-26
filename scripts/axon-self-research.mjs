#!/usr/bin/env node
/**
 * AXON Autonomous Self-Research — 3-area build-plan mode.
 * JB direct order 2026-08-26 (AXON-3-JOBS-REBUILD): turned back on (enabled=true),
 * every run now covers THREE areas — neuroscience->build plan, psychology->user
 * understanding, AI news->build plan — and hands the result to the AXON Executive
 * Agent via agent_bus. Self-reschedules within ~12h on a time/scope limit, loop-
 * engineers (reads what worked/didn't last run, logs it again this run), and only
 * pings JB on Telegram for genuinely urgent conditions (never routine status).
 */
import { loadConfig } from '../lib/config.mjs';
import { isTransientResearchError } from '../lib/axon-research-core.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { runThreeAreaResearch, buildHandoffBody } from '../lib/axon-self-research-build-plans.mjs';
import {
  handoffToAgent,
  telegramAlert,
  flagResumeNeeded,
  clearResumeFlag,
  readLastLoopNote,
  writeLoopNote,
} from '../lib/axon-agent-comms.mjs';

const ROUTINE_ID = 'axon-self-research';
const MAX_ATTEMPTS = Math.max(1, Number(process.env.AXON_RESEARCH_MAX_ATTEMPTS || 3));
const RETRY_BASE_MS = Math.max(500, Number(process.env.AXON_RESEARCH_RETRY_BASE_MS || 4000));
// GitHub Actions job timeout is 15 min — stop starting new areas after 10 min so
// there's always room to save findings + hand off before the runner gets killed.
const TIME_BUDGET_MS = Math.max(60_000, Number(process.env.AXON_RESEARCH_TIME_BUDGET_MS || 10 * 60_000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startedAt = Date.now();
  console.log(`AXON self-research (3-area build plans) — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);

  if (await cronGuardShouldSkip(ROUTINE_ID, sbSelect)) return;
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  // Loop-engineering: read what last run said worked/didn't before doing anything.
  const lastLoop = await readLastLoopNote(sbSelect, ROUTINE_ID);
  if (lastLoop) console.log(`Loop-engineering carry-forward: ${lastLoop.learning}`);
  else console.log('Loop-engineering: no prior note found — first run in this mode.');

  await clearResumeFlag(sbSelect, sbPatch, ROUTINE_ID);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        const waitMs = RETRY_BASE_MS * 2 ** (attempt - 2);
        console.log(`Self-research retry ${attempt}/${MAX_ATTEMPTS} in ${waitMs}ms`);
        await sleep(waitMs);
      }

      const { results, stoppedEarly, allHeuristic, summary, runId } = await runThreeAreaResearch({
        sbSelect,
        sbInsert,
        sbPatch,
        supabaseKey: cfg.supabaseKey,
        anthropicKey: cfg.anthropicKey,
        geminiKey: cfg.geminiKey,
        geminiBackup: cfg.geminiBackup,
        geminiModel: cfg.geminiModel,
        serpApiKey: cfg.serpApiKey,
        operatorId: 'default',
        dryRun,
        budgetCheck: () => Date.now() - startedAt > TIME_BUDGET_MS,
      });

      console.log(summary);

      if (stoppedEarly && !dryRun) {
        await flagResumeNeeded(
          sbSelect,
          sbPatch,
          ROUTINE_ID,
          `Stopped at area "${stoppedEarly}" — time budget hit mid-run.`,
          12
        );
      }

      if (results.length && !dryRun) {
        const body = buildHandoffBody(results, stoppedEarly);
        await handoffToAgent(sbInsert, {
          fromAgent: 'Self-Research',
          toAgent: 'AXON Executive Agent',
          subject: `SELF-RESEARCH-BUILD-PLANS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
          body,
          needsAnswer: true,
        });
      }

      if (allHeuristic && !dryRun) {
        await telegramAlert(
          sbSelect,
          `⚠️ AXON self-research ran but every area fell back to heuristic (no AI provider reachable). Worth a look when you get a sec — nothing broke, it just couldn't think anything through today.`
        );
      }

      if (!dryRun) {
        await writeLoopNote(sbInsert, ROUTINE_ID, {
          worked: results.filter((r) => r.result._provider && r.result._provider !== 'heuristic').map((r) => `${r.area.id} via ${r.result._provider}`),
          didntWork: results.filter((r) => r.result._provider === 'heuristic').map((r) => `${r.area.id} fell to heuristic`),
          applyNext: stoppedEarly ? [`resume from "${stoppedEarly}" first next run`] : [],
        });
      }

      return;
    } catch (err) {
      lastErr = err;
      const transient = isTransientResearchError(err);
      console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed${transient ? ' (transient)' : ''}:`, err);
      if (!transient || attempt >= MAX_ATTEMPTS) break;
    }
  }

  if (!dryRun) {
    await telegramAlert(sbSelect, `🔴 AXON self-research failed after ${MAX_ATTEMPTS} attempts: ${lastErr?.message || 'unknown error'}`);
    await writeLoopNote(sbInsert, ROUTINE_ID, {
      didntWork: [`run failed: ${(lastErr?.message || 'unknown').slice(0, 160)}`],
      applyNext: ['check provider keys / mini reachability before next scheduled run'],
    });
  }
  throw lastErr || new Error('AXON self-research failed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
