#!/usr/bin/env node
/**
 * AXON Autonomous Self-Research
 * Studies AI models, OSS repos, neuroscience — 4x/week via GitHub Actions.
 * Findings surface in operator daily briefs.
 * Always writes axon_research_runs lab log (completed | skipped | failed).
 */
import { loadConfig } from '../lib/config.mjs';
import {
  countRunsThisWeek,
  pickResearchLane,
  runAutonomousResearch,
  writeResearchRunLabLog,
} from '../lib/axon-research-core.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';

async function main() {
  console.log(`AXON self-research — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  const runsThisWeek = await countRunsThisWeek(sbSelect);
  const maxPerWeek = Number(process.env.AXON_RESEARCH_MAX_PER_WEEK || 4);
  const lane = process.env.AXON_RESEARCH_LANE || pickResearchLane();

  if (runsThisWeek >= maxPerWeek && !process.env.AXON_RESEARCH_FORCE) {
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

  const result = await runAutonomousResearch({
    sbSelect,
    sbInsert,
    sbPatch,
    anthropicKey: cfg.anthropicKey,
    serpApiKey: cfg.serpApiKey,
    operatorId: 'default',
    lane: process.env.AXON_RESEARCH_LANE || undefined,
    dryRun,
  });

  console.log(
    `Done — lane=${result.lane} findings=${result.findings.length} briefing_items=${result.briefingUpdates.length} runId=${result.runId || 'dry'}`
  );
  if (result.summary) console.log(result.summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
