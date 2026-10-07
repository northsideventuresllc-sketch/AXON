#!/usr/bin/env node
/**
 * AXON Legal Docs — reads the live Terms and Privacy pages that have a
 * confirmed address, flags clauses that disagree with the product facts, and
 * hands real findings to the AXON Executive over agent_bus. Logic lives in
 * lib/axon-legal-docs-review.mjs so it stays unit-testable offline.
 *
 * Usage: node scripts/axon-legal-docs-review.mjs [--dry-run]
 *   --dry-run (or AXON_DRY_RUN=1): fetch the pages and split them into
 *   windows, nothing else. No model call, no database access, no writes.
 *
 * Kill switch: the roster row (nvg_agent_routines.active) decides whether this
 * runs at all. There is no axon_cron_jobs row for it, so no cron guard here.
 *
 * Never messages anyone, JB included. The Executive reads the bus row and
 * routes any JB card; a run that reviewed nothing writes a failed lab-log row
 * and exits non-zero, which is how a failure surfaces.
 */
import { loadConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { runLegalDocsReview, recordLegalDocsFailure } from '../lib/axon-legal-docs-review.mjs';

// Keeps one run well inside the mini job runner's own timeout even on a slow
// router cascade — remaining documents just get picked up by next week's run.
const TIME_BUDGET_MS = Math.max(60_000, Number(process.env.AXON_LEGAL_DOCS_TIME_BUDGET_MS || 8 * 60_000));

async function main() {
  const startedAt = Date.now();
  const forcedDry = process.argv.includes('--dry-run') || process.env.AXON_DRY_RUN === '1';
  console.log(`AXON Legal Docs review${forcedDry ? ' (dry run)' : ''} — ${new Date().toISOString()}`);

  let sbInsert = async () => {
    throw new Error('dry run: database writes are off');
  };
  let dryRun = forcedDry;
  let supabaseKey;
  if (!forcedDry) {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = createSupabaseClient(key);
    sbInsert = client.sbInsert;
    const cfg = await loadConfig(client.sbSelect);
    dryRun = cfg.dryRun;
    supabaseKey = cfg.supabaseKey;
  }

  try {
    const { summary, status } = await runLegalDocsReview({
      sbInsert,
      supabaseKey,
      dryRun,
      budgetCheck: () => Date.now() - startedAt > TIME_BUDGET_MS,
    });
    console.log(summary);
    if (status !== 'completed' && status !== 'dry_run') process.exitCode = 1;
  } catch (err) {
    console.error('AXON Legal Docs review failed:', err);
    if (!dryRun) await recordLegalDocsFailure(sbInsert, err);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
