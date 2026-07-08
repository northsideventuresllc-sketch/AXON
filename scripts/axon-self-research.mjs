#!/usr/bin/env node
/**
 * AXON Autonomous Self-Research
 * Studies AI models, OSS repos, neuroscience — 4x/week via GitHub Actions.
 * Findings surface in operator daily briefs.
 */
import { loadConfig } from '../lib/config.mjs';
import { runAutonomousResearch, countRunsThisWeek } from '../lib/axon-research-core.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';

async function main() {
  console.log(`AXON self-research — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  const runsThisWeek = await countRunsThisWeek(sbSelect);
  const maxPerWeek = Number(process.env.AXON_RESEARCH_MAX_PER_WEEK || 4);
  if (runsThisWeek >= maxPerWeek && !process.env.AXON_RESEARCH_FORCE) {
    console.log(`Skipping — ${runsThisWeek}/${maxPerWeek} runs already this week`);
    return;
  }

  const lane = process.env.AXON_RESEARCH_LANE || undefined;

  const result = await runAutonomousResearch({
    sbSelect,
    sbInsert,
    sbPatch,
    anthropicKey: cfg.anthropicKey,
    serpApiKey: cfg.serpApiKey,
    operatorId: 'default',
    lane,
    dryRun,
  });

  console.log(
    `Done — lane=${result.lane} findings=${result.findings.length} briefing_items=${result.briefingUpdates.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
