#!/usr/bin/env node
/**
 * AXON UI Copy — reviews on-screen text in app/ and components/ for grammar,
 * word choice and AI slop, and hands real findings to the AXON Executive.
 * JB turned this roster row on 2026-10-06 (IU2-AXON-UICOPY-1006); logic lives
 * in lib/axon-ui-copy-review.mjs so it stays unit-testable offline.
 */
import { loadConfig } from '../lib/config.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { runUiCopyReview } from '../lib/axon-ui-copy-review.mjs';
import { telegramAlert } from '../lib/axon-agent-comms.mjs';

const ROUTINE_ID = 'axon-ui-copy-review';
// Keeps one run well inside the mini job runner's own timeout even on a slow
// router cascade — remaining files just get picked up by next week's run.
const TIME_BUDGET_MS = Math.max(60_000, Number(process.env.AXON_UI_COPY_TIME_BUDGET_MS || 8 * 60_000));

async function main() {
  const startedAt = Date.now();
  console.log(`AXON UI Copy review — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert } = createSupabaseClient(key);

  if (await cronGuardShouldSkip(ROUTINE_ID, sbSelect)) return;
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  try {
    const { summary, totalIssues, filesScanned, stoppedEarly } = await runUiCopyReview({
      sbInsert,
      supabaseKey: cfg.supabaseKey,
      repoRoot: process.cwd(),
      dryRun,
      budgetCheck: () => Date.now() - startedAt > TIME_BUDGET_MS,
    });

    console.log(summary);
    if (filesScanned === 0 && !dryRun) {
      await telegramAlert(sbSelect, `⚠️ AXON UI Copy ran but scanned 0 files — check app/components paths. ${summary}`);
    }
  } catch (err) {
    console.error('AXON UI Copy review failed:', err);
    if (!dryRun) {
      await telegramAlert(sbSelect, `🔴 AXON UI Copy failed: ${err.message}`);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
