#!/usr/bin/env node
/**
 * AXON UI Copy — reviews on-screen text in app/ and components/ for grammar,
 * word choice and AI slop, and hands real findings to the AXON Executive.
 * JB turned this roster row on 2026-10-06 (IU2-AXON-UICOPY-1006); logic lives
 * in lib/axon-ui-copy-review.mjs so it stays unit-testable offline.
 *
 *   node scripts/axon-ui-copy-review.mjs            real run (needs the database key)
 *   node scripts/axon-ui-copy-review.mjs --dry-run  count screen text only: no model,
 *                                                   no database, no network
 *
 * A run has a time budget (AXON_UI_COPY_TIME_BUDGET_MS, default 8 minutes). The
 * start point rotates by ISO week, so files left over when the budget runs out
 * lead a later week's run. Failures go to the run log, never to JB's chat.
 */
import { runCli } from '../lib/axon-ui-copy-review.mjs';

runCli({ argv: process.argv.slice(2) })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`AXON UI Copy stopped unexpectedly: ${String(err?.message || err).slice(0, 200)}`);
    process.exitCode = 1;
  });
