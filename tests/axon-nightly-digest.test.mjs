#!/usr/bin/env node
/**
 * axon-nightly-digest helpers — run: node tests/axon-nightly-digest.test.mjs
 */
import assert from 'node:assert/strict';
import {
  tokenize,
  buildCorpusFreq,
  scoreEntry,
  rankTopN,
  runNightlyDigest,
  routeFeed,
  fetchDigestForSensei,
  writeHeartbeat,
  SENSEI_DIGEST_QUERY,
} from '../lib/axon-nightly-digest.mjs';
import { AGENT } from '../lib/agent-names.mjs';

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

// AXON-WIRING-1006 part 3 ------------------------------------------------

// routeFeed: Decisions -> AXON Executive, Learnings -> Training Librarian, else honest "unrouted".
assert.deepEqual(routeFeed('Decisions:10'), {
  feeds: AGENT.EXECUTIVE_AGENT,
  reason: 'Decisions rows feed the wisdom/decision loop AXON Executive runs nightly',
});
assert.deepEqual(routeFeed('Learnings:5'), {
  feeds: AGENT.TRAINING_INGEST,
  reason: "Learnings rows feed the Training Librarian's training-corpus ingest",
});
assert.equal(routeFeed('something_else:1').feeds, null);
assert.equal(routeFeed(undefined).feeds, null);
assert.equal(routeFeed(null).feeds, null);

// SENSEI_DIGEST_QUERY / fetchDigestForSensei: the one defined read, exercised end to end.
assert.match(SENSEI_DIGEST_QUERY, /day_key=eq\.<YYYY-MM-DD>/);
assert.match(SENSEI_DIGEST_QUERY, /order=score\.desc/);
const senseiCalls = [];
const senseiFetch = async (url) => {
  senseiCalls.push(url);
  return { ok: true, json: async () => [{ day_key: '2026-10-06', entry_ref: 'Decisions:1', score: 1.2, summary: 'x' }] };
};
const senseiRows = await fetchDigestForSensei({ dayKey: '2026-10-06', key: 'test-key', fetchImpl: senseiFetch });
assert.equal(senseiRows.length, 1);
assert.ok(senseiCalls[0].includes('day_key=eq.2026-10-06'));
assert.ok(senseiCalls[0].includes('order=score.desc'));

// fetchDigestForSensei: a non-ok response surfaces, never swallowed.
const failFetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
await assert.rejects(() => fetchDigestForSensei({ dayKey: '2026-10-06', key: 'test-key', fetchImpl: failFetch }), /HTTP 500/);

// writeHeartbeat: posts the same job_key/run_id/status/started_at/finished_at shape
// nvg-close.mjs already writes, to nvg_run_heartbeats — and never throws on failure.
const heartbeatCalls = [];
const heartbeatFetch = async (url, opts) => {
  heartbeatCalls.push({ url, opts });
  return { ok: true };
};
const hbOk = await writeHeartbeat({
  dayKey: '2026-10-06',
  status: 'ok',
  startedAtIso: '2026-10-07T03:45:00.000Z',
  finishedAtIso: '2026-10-07T03:45:02.000Z',
  key: 'test-key',
  fetchImpl: heartbeatFetch,
});
assert.equal(hbOk.ok, true);
assert.ok(heartbeatCalls[0].url.includes('/rest/v1/nvg_run_heartbeats'));
const hbBody = JSON.parse(heartbeatCalls[0].opts.body);
assert.equal(hbBody.job_key, 'axon-nightly-digest');
assert.match(hbBody.run_id, /^axon-nightly-digest-2026-10-06-/);
assert.equal(hbBody.status, 'ok');
assert.equal(hbBody.started_at, '2026-10-07T03:45:00.000Z');
assert.equal(hbBody.finished_at, '2026-10-07T03:45:02.000Z');

const hbFail = await writeHeartbeat({
  dayKey: '2026-10-06',
  status: 'ok',
  startedAtIso: '2026-10-07T03:45:00.000Z',
  finishedAtIso: '2026-10-07T03:45:02.000Z',
  key: 'test-key',
  fetchImpl: async () => {
    throw new Error('network down');
  },
});
assert.equal(hbFail.ok, false);
assert.match(hbFail.error, /network down/);

// runNightlyDigest: dry run skips BOTH the digest write and the heartbeat (never ran, per monitoring);
// feedRouting is always computed and returned even in a dry run.
const dryRunFetch = async (url) => {
  if (url.includes('/rest/v1/Decisions')) {
    return { ok: true, json: async () => [{ id: 10, decision: 'quantum droid teleportation breakthrough', created_at: '2026-09-22T10:00:00Z' }] };
  }
  if (url.includes('/rest/v1/Learnings')) return { ok: true, json: async () => [] };
  throw new Error(`unexpected write during dry run: ${url}`);
};
const dryRun2 = await runNightlyDigest({ dayKey: '2026-09-22', key: 'test-key', fetchImpl: dryRunFetch, dryRun: true });
assert.equal(dryRun2.heartbeat, null);
assert.ok(dryRun2.feedRouting.length >= 1);
assert.equal(dryRun2.feedRouting[0].entry_ref, 'Decisions:10');
assert.equal(dryRun2.feedRouting[0].feeds, AGENT.EXECUTIVE_AGENT);

// runNightlyDigest: a real (non-dry) run writes the digest AND records a heartbeat.
const liveCalls = [];
const liveFetch = async (url, opts) => {
  liveCalls.push(url);
  if (url.includes('/rest/v1/Decisions')) {
    return { ok: true, json: async () => [{ id: 10, decision: 'quantum droid teleportation breakthrough', created_at: '2026-09-22T10:00:00Z' }] };
  }
  if (url.includes('/rest/v1/Learnings')) return { ok: true, json: async () => [] };
  if (url.includes('/rest/v1/axon_nightly_digest')) return { ok: true };
  if (url.includes('/rest/v1/nvg_run_heartbeats')) return { ok: true };
  return { ok: true, json: async () => [] };
};
const liveResult = await runNightlyDigest({ dayKey: '2026-09-22', key: 'test-key', fetchImpl: liveFetch, dryRun: false });
assert.equal(liveResult.heartbeat.ok, true);
assert.ok(liveCalls.some((u) => u.includes('/rest/v1/nvg_run_heartbeats')));
assert.ok(liveResult.feedRouting.length >= 1);

console.log('axon-nightly-digest.test.mjs: all assertions passed');
