#!/usr/bin/env node
/**
 * Wisdom absorb loop — run: node tests/wisdom-absorb-loop.test.mjs
 */
import assert from 'node:assert/strict';
import {
  digestEvents,
  diversifyWisdom,
  enhanceFromWisdom,
  formatWisdomForPrompt,
  runWisdomAbsorbLoop,
  scoreSalience,
  watchSources,
  wisdomFingerprint,
  wisdomLoopChecklist,
} from '../lib/wisdom-absorb-loop.mjs';

const fp1 = wisdomFingerprint('One thing', 'Prefer short loops');
const fp2 = wisdomFingerprint('One thing', 'Prefer short loops');
const fp3 = wisdomFingerprint('Other', 'Prefer short loops');
assert.equal(fp1, fp2);
assert.notEqual(fp1, fp3);

const events = watchSources({
  corpus: [
    {
      external_id: 'ND-027',
      title: 'Delay aversion',
      key_finding: 'Delay aversion is empirically distinct from EF accounts.',
      axon_application: 'Shrink waiting UX; never leave JB silent.',
      domain: 'adhd',
      confidence: 'verified',
    },
  ],
  findings: [
    {
      id: 'f1',
      title: 'J-space broadcast',
      summary: 'Capacity-limited workspace improves high-order routing.',
      implementation_hint: 'Keep ≤6 active concepts.',
      research_lane: 'ai_models',
      priority: 'high',
    },
  ],
  learnings: [
    {
      id: 945,
      learning:
        '[PREFERENCE] Default target: superior AXON / Slow Takeover / Mac ON wisdom absorb.',
      category: 'axon-comm',
      project: 'AXON',
    },
  ],
  signals: [
    {
      id: 's1',
      signal_type: 'tone',
      signal_key: 'plain_english',
      signal_value: 'prefer',
      evidence_count: 4,
    },
  ],
});
assert.equal(events.length, 4);
assert.ok(events.some((e) => e.source_type === 'learning'));

const digested = digestEvents(events, { limit: 10 });
assert.ok(digested.length >= 3);
assert.ok(scoreSalience(digested[0]) > 0);
assert.ok(digested.some((d) => d.source_type === 'nd_corpus'));
assert.ok(digested.some((d) => d.source_type === 'learning'));

const onlyLearning = Array.from({ length: 8 }, (_, i) => ({
  fingerprint: `l${i}`,
  title: `L${i}`,
  principle: `learning ${i}`,
  application: '',
  domain: 'ops',
  source_type: 'learning',
  source_ref: null,
  confidence: 'verified',
  salience: 9 - i * 0.1,
}));
const mixedPool = [
  ...onlyLearning,
  {
    fingerprint: 'nd1',
    title: 'ND',
    principle: 'delay aversion',
    application: 'short loops',
    domain: 'adhd',
    source_type: 'nd_corpus',
    source_ref: 'ND-027',
    confidence: 'verified',
    salience: 5,
  },
];
const diverse = diversifyWisdom(mixedPool, 6);
assert.ok(diverse.some((d) => d.source_type === 'nd_corpus'), 'nd_corpus reserved in mix');
assert.ok(diverse.filter((d) => d.source_type === 'learning').length >= 1);
assert.equal(diverse.length, 6);

const enhancement = enhanceFromWisdom(digested, {
  active_concepts: [],
  broadcast_queue: [],
  gap_backlog: [],
  implementation_queue: [],
  meta: {},
});
assert.ok(enhancement.enhancedCount >= 1);
assert.ok(enhancement.jspace.active_concepts.length >= 1);
assert.ok(enhancement.jspace.broadcast_queue.length >= 1);
assert.match(enhancement.promptBlock, /Wisdom absorb/);
assert.match(formatWisdomForPrompt([]), /empty/);

let persistedItems = null;
let persistedRun = null;
let persistedJspace = null;

const run = await runWisdomAbsorbLoop({
  corpus: [
    {
      external_id: 'ND-030',
      title: 'd-factor',
      key_finding: 'Trait distractibility relates to ADHD symptomatology.',
      axon_application: 'ONE-thing messaging.',
      domain: 'adhd',
      confidence: 'verified',
    },
  ],
  learnings: [
    {
      id: 1,
      learning: '[CORRECTION] Never pitch a phone call first.',
      category: 'outreach',
      project: 'AXON',
    },
  ],
  findings: [],
  signals: [],
  dryRun: false,
  forceHeuristic: true,
  persistItems: async (rows) => {
    persistedItems = rows;
    return rows;
  },
  persistRun: async (record) => {
    persistedRun = record;
    return record;
  },
  persistJspace: async (state) => {
    persistedJspace = state;
    return state;
  },
});

assert.equal(run.ok, true);
assert.equal(run.dryRun, false);
assert.equal(run.provider, 'heuristic');
assert.ok(run.watchedCount >= 2);
assert.ok(run.digested.length >= 2);
assert.ok(persistedItems?.length >= 2);
assert.equal(persistedRun?.watched_count, run.watchedCount);
assert.ok(persistedJspace?.active_concepts?.length >= 1);
assert.match(run.summary, /Wisdom absorb/i);

const dry = await runWisdomAbsorbLoop({
  corpus: [],
  findings: [],
  learnings: [{ id: 2, learning: 'Keep brand NORTHSiDE casing.', category: 'brand' }],
  signals: [],
  dryRun: true,
  forceHeuristic: true,
});
assert.equal(dry.dryRun, true);
assert.equal(dry.runRecord.absorbed_count, 0);

const checklist = wisdomLoopChecklist();
assert.ok(checklist.length >= 5);
assert.ok(checklist.some((line) => line.includes('wisdom')));

console.log('wisdom-absorb-loop.test.mjs OK');
