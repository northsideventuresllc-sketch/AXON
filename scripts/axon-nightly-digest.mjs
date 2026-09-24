#!/usr/bin/env node
/**
 * AXON-NIGHTLY-DIGEST-BUILD-0923 — nightly job: score the day's Decisions/Learnings
 * entries for novelty vs the prior 7 days and write the top-N ranked shortlist to
 * axon_nightly_digest (entry_ref, score, summary, day_key).
 *
 * Read-only against the model -- NO weight updates, NO fine-tune step. Pure word-
 * frequency novelty scoring (see lib/axon-nightly-digest.mjs).
 *
 * Usage:
 *   node scripts/axon-nightly-digest.mjs                 # scores yesterday (UTC), writes
 *   node scripts/axon-nightly-digest.mjs --day=2026-09-22 # score a specific UTC day
 *   node scripts/axon-nightly-digest.mjs --top-n=20
 *   AXON_DRY_RUN=1 node scripts/axon-nightly-digest.mjs   # print only, no write
 */
import { runNightlyDigest } from '../lib/axon-nightly-digest.mjs';

function yesterdayUtcKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function argValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

async function main() {
  const key = getSupabaseKey();
  if (!key) {
    console.error('No SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY set — nothing to do.');
    process.exit(1);
  }

  const dayKey = argValue('day') || yesterdayUtcKey();
  const topN = Number(argValue('top-n') || 15);
  const priorDays = Number(argValue('prior-days') || 7);
  const dryRun = process.env.AXON_DRY_RUN === '1';

  const result = await runNightlyDigest({ dayKey, topN, priorDays, key, dryRun });

  console.log(
    `axon-nightly-digest: day=${dayKey} — ${result.dayEntryCount} entr${result.dayEntryCount === 1 ? 'y' : 'ies'} scored ` +
      `against ${result.priorEntryCount} prior-window entries, top ${result.rows.length} kept.`,
  );
  for (const row of result.rows.slice(0, 10)) {
    console.log(`  ${row.score.toFixed(3)}  ${row.entry_ref}  "${row.summary.slice(0, 70)}"`);
  }

  if (dryRun) {
    console.log('DRY RUN — nothing written. Unset AXON_DRY_RUN to write.');
    return;
  }
  console.log(`Wrote ${result.written} row(s) to axon_nightly_digest.`);
}

main().catch((err) => {
  console.error('axon-nightly-digest failed:', err?.message || err);
  process.exit(1);
});
