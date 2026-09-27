#!/usr/bin/env node
/**
 * AXON-MODEL-FRONTIER-SESSION-0925 deliverable 3: "a test proving recall." This is that
 * test — it builds a recall index over a realistic mixed corpus (shaped exactly like
 * scripts/axon-history-export.mjs's toTrainingRecord output: several real-sounding
 * Learnings/Decisions on unrelated topics), then proves a targeted query surfaces the
 * ONE record that actually answers it, ranked above every unrelated record in the same
 * corpus — not just "some record came back," but the CORRECT one, on more than one query.
 *
 * Run: node --test tests/axon-recall-index.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenize, buildRecallIndex, recall } from '../lib/axon-recall-index.mjs';
import { toTrainingRecord } from '../scripts/axon-history-export.mjs';

// A small, realistic mixed corpus — same shape toTrainingRecord actually produces, built
// from that same function so this test can't drift from the export's real record shape.
const RAW_LEARNINGS = [
  { id: 1, project: 'axon', learning: 'RunPod AXON v1 is a paid pay-per-use serverless endpoint, currently ~0% success from a negative client balance. Skip it automatically while unfunded, never call it free (Decision #2001).' },
  { id: 2, project: 'matchfit', learning: 'Match Fit coach recruiting is nationwide, online/virtual coaches only. No city, polygon, or Atlanta reference anywhere in search, outreach copy, or code comments (Decision #342).' },
  { id: 3, project: 'northstarswimschool', learning: 'North-Stars Swim School money never runs through an NVG checking account. Foundation money follows FSA Model C -> FSA holds donations -> Mazlo for spend.' },
  { id: 4, project: 'axon', learning: 'axon-ornith cold-load timeouts on the 5.6GB model are the dominant cause of local Ollama relay failures under mini disk/load pressure; the fix is a per-model tuned curl timeout, not a flat constant.' },
  { id: 5, project: 'northside-intelligence', learning: 'Two Resend accounts exist: RESEND_API_KEY_NI for northsideintelligence.com, RESEND_API_KEY for match-fit.net. Sending NI mail with the Match Fit key silently fails.' },
];
const CORPUS = RAW_LEARNINGS.map((row) => toTrainingRecord(row, 'learning', ['learning']));

test('tokenize: lowercases, strips punctuation, drops stopwords and short tokens', () => {
  const terms = tokenize('The RunPod AXON v1 is NOT free — it is paid!');
  assert.ok(terms.includes('runpod'));
  assert.ok(terms.includes('paid'));
  assert.ok(!terms.includes('the'), 'stopwords must be dropped');
  assert.ok(!terms.includes('is'), 'short tokens must be dropped');
});

test('recall: a query about RunPod funding surfaces the RunPod Learning above all others', () => {
  const index = buildRecallIndex(CORPUS);
  const results = recall(index, 'is RunPod actually free or is it a paid serverless endpoint', 3);
  assert.ok(results.length > 0, 'expected at least one match');
  assert.match(results[0].record.completion, /RunPod/, 'top result must be the RunPod record');
  assert.match(results[0].record.completion, /Decision #2001/);
  // The RunPod record must clearly outscore the next-best, unrelated one.
  if (results.length > 1) assert.ok(results[0].score > results[1].score);
});

test('recall: a query about Match Fit geo-targeting surfaces the nationwide-coaches Learning, not the RunPod one', () => {
  const index = buildRecallIndex(CORPUS);
  const results = recall(index, 'is match fit coach recruiting limited to a city or region', 3);
  assert.ok(results.length > 0);
  assert.match(results[0].record.completion, /nationwide/i);
  assert.match(results[0].record.completion, /Decision #342/);
});

test('recall: a query about the relay timeout fix surfaces the axon-ornith cold-load Learning', () => {
  const index = buildRecallIndex(CORPUS);
  const results = recall(index, 'why do local ollama relay calls time out', 3);
  assert.ok(results.length > 0);
  assert.match(results[0].record.completion, /axon-ornith/);
  assert.match(results[0].record.completion, /timeout/i);
});

test('recall: a query with no matching terms in the corpus returns nothing (never a false positive)', () => {
  const index = buildRecallIndex(CORPUS);
  const results = recall(index, 'quarterly tax filing deadline for a Delaware C-corp', 3);
  assert.deepEqual(results, []);
});

test('recall: respects topK and never returns a zero-score record', () => {
  const index = buildRecallIndex(CORPUS);
  const results = recall(index, 'Northside Intelligence email Resend account key', 2);
  assert.ok(results.length <= 2);
  for (const r of results) assert.ok(r.score > 0);
});

test('buildRecallIndex: handles an empty corpus without throwing', () => {
  const index = buildRecallIndex([]);
  assert.deepEqual(recall(index, 'anything at all'), []);
});
