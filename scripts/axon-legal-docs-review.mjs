#!/usr/bin/env node
/**
 * AXON Legal Docs — checks Terms/Privacy/binding docs against known product
 * facts and hands real mismatches to the AXON Executive for routing.
 * JB turned this roster row on 2026-10-06 (IU2-AXON-LEGAL-1006); logic lives
 * in lib/axon-legal-docs-review.mjs so it stays unit-testable offline.
 */
import { loadConfig } from '../lib/config.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { runLegalDocsReview } from '../lib/axon-legal-docs-review.mjs';
import { telegramAlert } from '../lib/axon-agent-comms.mjs';

const ROUTINE_ID = 'dormant:axon-legal-docs';
// Keeps one run well inside the mini job runner's own timeout even on a slow
// router cascade — remaining documents just get picked up by next week's run.
const TIME_BUDGET_MS = Math.max(60_000, Number(process.env.AXON_LEGAL_DOCS_TIME_BUDGET_MS || 8 * 60_000));

async function main() {
  const startedAt = Date.now();
  console.log(`AXON Legal Docs review — ${new Date().toISOString()}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbInsert } = createSupabaseClient(key);

  if (await cronGuardShouldSkip(ROUTINE_ID, sbSelect)) return;
  const cfg = await loadConfig(sbSelect);
  const dryRun = cfg.dryRun || process.env.AXON_DRY_RUN === '1';

  try {
    const { summary, reviewed, needsJbCount, stoppedEarly } = await runLegalDocsReview({
      sbInsert,
      supabaseKey: cfg.supabaseKey,
      dryRun,
      budgetCheck: () => Date.now() - startedAt > TIME_BUDGET_MS,
    });

    console.log(summary);
    if (needsJbCount > 0 && !dryRun) {
      await telegramAlert(sbSelect, `⚠️ AXON Legal Docs found ${needsJbCount} mismatch(es) needing a JB decision brief. ${summary}`, {
        agentName: 'AXON Legal Docs',
      });
    }
    if (reviewed === 0 && !dryRun) {
      await telegramAlert(sbSelect, `⚠️ AXON Legal Docs ran but reviewed 0 documents — check configured site URLs. ${summary}`, {
        agentName: 'AXON Legal Docs',
      });
    }
  } catch (err) {
    console.error('AXON Legal Docs review failed:', err);
    if (!dryRun) {
      await telegramAlert(sbSelect, `🔴 AXON Legal Docs failed: ${err.message}`, { agentName: 'AXON Legal Docs' });
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
