#!/usr/bin/env node
/**
 * Stress-test AXON cron catalog shape (static checks).
 * Run: node scripts/stress-test-cron-droid.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'lib/axon-cron-jobs.ts'), 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const ids = [
  'axon-self-research',
  'axon-telegram-poll',
  'axon-content-batch-notify',
  'axon-ni-outreach',
  'hermes-agent-dispatch',
  'axon-mf-ad-tracker',
  'axon-local-model-daily',
];
for (const id of ids) {
  assert(src.includes(`id: '${id}'`), `catalog includes ${id}`);
}

assert(src.includes('estimateNextRunUtc'), 'next-run helper present');
assert(src.includes('DroidFaceShape'), 'droid face shapes typed');
assert(src.includes('faceShape'), 'jobs have face shapes');

console.log(failed ? `\n${failed} assertion(s) failed` : '\nAll cron/droid static checks passed');
process.exit(failed ? 1 : 0);
