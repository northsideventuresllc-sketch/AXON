#!/usr/bin/env node
/**
 * axon-nightly-digest helpers — run: node tests/axon-nightly-digest.test.mjs
 */
import assert from 'node:assert/strict';
import { tokenize, buildCorpusFreq, scoreEntry, rankTopN, runNightlyDigest } from '../lib/axon-nightly-digest.mjs';

// tokenize: lowercases, dedupes, drops stopwords/short tokens
assert.deepEqual(tokenize('The Quick Brown fox jumps and jumps'), ['quick', 'brown', 'fox', 'jumps']);
assert.deepEqual(tokenize(''), []);

// buildCorpusFreq: counts docs containing each word, not raw occurrences
const corpus = buildCorpusFreq([
  { text: 'wisdom loop absorbed findings' },
  { text: 'wisdom loop stalled again' },
  { text: 'unrelated ledger reconciliation' },
]);
assert.equal(corpus.docCount, 3);
assert.equal(corpus.docFreq.get('wisdom'), 2);
assert.equal(corpus.docFreq.get('loop'), 2);
assert.equal(corpus.docFreq.get('ledger'), 1);

// scoreEntry: an entry built entirely from words already common in the prior
// corpus scores lower than one introducing unseen vocabulary.
const boilerplateScore = scoreEntry('wisdom loop absorbed', corpus);
const novelScore = scoreEntry('quantum droid teleportation breakthrough', corpus);
assert.ok(novelScore > boilerplateScore, `expected novel (${novelScore}) > boilerplate (${boilerplateScore})`);
assert.equal(scoreEntry('', corpus), 0);

// rankTopN: highest score first, capped at topN, correct day_key/entry_ref/summary shape
const dayEntries = [
  { ref: 'Decisions:1', text: 'wisdom loop absorbed findings again' },
  { ref: 'Learnings:2', text: 'quantum droid teleportation breakthrough discovered' },
  { ref: 'Decisions:3', text: 'wisdom about unrelated ledger reconciliation completed' },
];
const ranked = rankTopN(dayEntries, [
  { text: 'wisdom loop absorbed findings' },
  { text: 'wisdom loop stalled again' },
], '2026-09-22', 2);
assert.equal(ranked.length, 2);
assert.equal(ranked[0].entry_ref, 'Learnings:2');
assert.equal(ranked[0].day_key, '2026-09-22');
assert.ok(ranked[0].score > ranked[1].score);
assert.ok(ranked.every((r) => typeof r.summary === 'string'));

// runNightlyDigest: injectable fetchImpl, dryRun skips the write, correct REST calls made
const calls = [];
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes('/rest/v1/Decisions')) {
    return {
      ok: true,
      json: async () => [{ id: 10, decision: 'quantum droid teleportation breakthrough', created_at: '2026-09-22T10:00:00Z' }],
    };
  }
  if (url.includes('/rest/v1/Learnings')) {
    return { ok: true, json: async () => [] };
  }
  if (url.includes('/rest/v1/axon_nightly_digest')) {
    throw new Error('should not write during dry run');
  }
  return { ok: true, json: async () => [] };
};

const dryResult = await runNightlyDigest({ dayKey: '2026-09-22', key: 'test-key', fetchImpl: fakeFetch, dryRun: true });
assert.equal(dryResult.ok, true);
assert.equal(dryResult.written, 0);
assert.equal(dryResult.dryRun, true);
assert.ok(dryResult.rows.length >= 1);
assert.ok(calls.some((c) => c.url.includes('/rest/v1/Decisions')));
assert.ok(calls.some((c) => c.url.includes('/rest/v1/Learnings')));

// Live-write path exercises the upsert call shape (on_conflict + merge-duplicates).
const writeCalls = [];
const writeFetch = async (url, opts) => {
  writeCalls.push({ url, opts });
  if (url.includes('/rest/v1/Decisions')) {
    return {
      ok: true,
      json: async () => [{ id: 10, decision: 'quantum droid teleportation breakthrough', created_at: '2026-09-22T10:00:00Z' }],
    };
  }
  return { ok: true, json: async () => [] };
};
const writeResult = await runNightlyDigest({ dayKey: '2026-09-22', key: 'test-key', fetchImpl: writeFetch, dryRun: false });
assert.equal(writeResult.written, writeResult.rows.length);
const upsertCall = writeCalls.find((c) => c.url.includes('/rest/v1/axon_nightly_digest'));
assert.ok(upsertCall, 'expected an upsert call to axon_nightly_digest');
assert.equal(upsertCall.opts.method, 'POST');
assert.match(upsertCall.opts.headers.Prefer, /merge-duplicates/);
assert.match(upsertCall.url, /on_conflict=day_key,entry_ref/);

console.log('axon-nightly-digest.test.mjs: all assertions passed');
