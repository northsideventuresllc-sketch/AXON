#!/usr/bin/env node
/**
 * AXON Autonomous Self-Research
 * Studies AI models, OSS repos, neuroscience — 4x/week via GitHub Actions.
 * Findings surface in operator daily briefs.
 * Always writes axon_research_runs lab log (completed | skipped | failed).
 * Cascade: Haiku → Gemini → heuristic; transient errors auto-retry in-process.
 */
import { loadConfig } from '../lib/config.mjs';
import {
  countRunsThisWeek,
  isResearchForceEnabled,
  isTransientResearchError,
  pickResearchLane,
  runAutonomousResearch,
  writeResearchRunLabLog,
} from '../lib/axon-research-core.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';

const MAX_ATTEMPTS = Math.max(1, Number(process.env.AXON_RESEARCH_MAX_ATTEMPTS || 3));
const RETRY_BASE_MS = Math.max(500, Number(process.env.AXON_RESEARCH_RETRY_BASE_MS || 4000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`AXON self-research — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  const runsThisWeek = await countRunsThisWeek(sbSelect);
  const maxPerWeek = Number(process.env.AXON_RESEARCH_MAX_PER_WEEK || 4);
  const lane = process.env.AXON_RESEARCH_LANE || pickResearchLane();
  const force = isResearchForceEnabled();

  if (runsThisWeek >= maxPerWeek && !force) {
    const reason = `${runsThisWeek}/${maxPerWeek} completed runs already this week`;
    console.log(`Skipping — ${reason}`);
    if (!dryRun) {
      await writeResearchRunLabLog(sbInsert, {
        operatorId: 'default',
        lane,
        findingsCount: 0,
        briefingItemsAdded: 0,
        status: 'skipped',
        errorMessage: reason,
        meta: { runs_this_week: runsThisWeek, max_per_week: maxPerWeek },
      });
    }
    return;
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        const waitMs = RETRY_BASE_MS * 2 ** (attempt - 2);
        console.log(`Self-research retry ${attempt}/${MAX_ATTEMPTS} in ${waitMs}ms`);
        await sleep(waitMs);
      }

      const result = await runAutonomousResearch({
        sbSelect,
        sbInsert,
        sbPatch,
        anthropicKey: cfg.anthropicKey,
        geminiKey: cfg.geminiKey,
        geminiBackup: cfg.geminiBackup,
        geminiModel: cfg.geminiModel,
        serpApiKey: cfg.serpApiKey,
        operatorId: 'default',
        lane: process.env.AXON_RESEARCH_LANE || undefined,
        dryRun,
      });

      console.log(
        `Done — lane=${result.lane} findings=${result.findings.length} briefing_items=${result.briefingUpdates.length} provider=${result.provider || '?'} runId=${result.runId || 'dry'}`
      );
      if (result.summary) console.log(result.summary);
      return;
    } catch (err) {
      lastErr = err;
      const transient = isTransientResearchError(err);
      console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed${transient ? ' (transient)' : ''}:`, err);
      if (!transient || attempt >= MAX_ATTEMPTS) break;
    }
  }

  throw lastErr || new Error('AXON self-research failed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
