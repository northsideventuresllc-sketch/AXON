#!/usr/bin/env node
/**
 * AXON Inhibitor — run: node tests/axon-inhibitor.test.mjs
 * Proves the retrieval-gain layer: live scoring, broadcast budget, foreign
 * diversity, distinct-verifier node, and the AXON NEVER FORGETS invariant.
 */
import assert from 'node:assert/strict';
import {
  MEMORY_BROADCAST_BUDGET,
  FOREIGN_SLOTS,
  significantTerms,
  termOverlap,
  computeRetrievalGain,
  selectMemoriesForContext,
  requireDistinctVerifier,
  pickVerifier,
} from '../lib/axon-inhibitor-core.mjs';
import {
  pickForeignDomain,
  buildForeignConcept,
  FOREIGN_DOMAINS,
} from '../lib/axon-foreign-input-core.mjs';

let passed = 0;
function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }

// --- term helpers -----------------------------------------------------------
assert.ok(significantTerms('The Match Fit trainer app').has('match'));
assert.ok(!significantTerms('the a an of').size, 'stopwords stripped');
assert.equal(termOverlap(significantTerms('match fit trainer'), significantTerms('match fit')), 1);
ok('term helpers');

// --- gain is context-relevant ----------------------------------------------
const relevant = { content: 'JB prefers Match Fit trainer marketplace revenue splits', memory_type: 'preference' };
const irrelevant = { content: 'The weather in Chamblee was mild', memory_type: 'context' };
const ctx = { taskText: 'help me price the Match Fit trainer split', channel: 'chat' };
assert.ok(
  computeRetrievalGain(relevant, ctx) > computeRetrievalGain(irrelevant, ctx),
  'relevant memory scores higher for the current task'
);
ok('gain tracks current-task relevance');

// --- AXON NEVER FORGETS: gain has NO age term -------------------------------
// Two identical-content memories, one "ancient" one "new". Age must not matter.
const ancient = { content: 'AXON never forgets is the locked constraint', memory_type: 'fact', confidence: 0.7, created_at: '2020-01-01T00:00:00Z' };
const fresh = { content: 'AXON never forgets is the locked constraint', memory_type: 'fact', confidence: 0.7, created_at: '2026-08-05T00:00:00Z' };
const memCtx = { taskText: 'what is the AXON forgets constraint', channel: 'briefing' };
assert.equal(
  computeRetrievalGain(ancient, memCtx),
  computeRetrievalGain(fresh, memCtx),
  'age must not change retrieval gain — silence is not deletion'
);
ok('no decay: a year-old memory returns at full strength');

// --- broadcast budget is a hard cap ----------------------------------------
const pool = Array.from({ length: 40 }, (_, i) => ({
  id: `m${i}`,
  content: `memory ${i} about ${i % 2 ? 'match fit trainer athletes' : 'unrelated topic ' + i}`,
  memory_type: 'context',
  confidence: 0.6,
}));
const sel = selectMemoriesForContext(pool, { taskText: 'match fit trainer', channel: 'chat' });
assert.equal(sel.memories.length, MEMORY_BROADCAST_BUDGET, 'surfaced set capped at budget');
assert.equal(sel.candidates, 40, 'ALL memories competed — none pre-hidden');
ok(`broadcast budget caps surface at ${MEMORY_BROADCAST_BUDGET}, full pool competes`);

// --- nothing persisted: same pool, different context, different result ------
const selA = selectMemoriesForContext(pool, { taskText: 'match fit trainer', channel: 'chat' });
const selB = selectMemoriesForContext(pool, { taskText: 'unrelated topic 7', channel: 'chat' });
assert.notDeepEqual(
  selA.memories.map((m) => m.id),
  selB.memories.map((m) => m.id),
  'retrieval is recomputed live per context — never a stored verdict'
);
ok('live per-query: same store surfaces differently as context changes');

// --- foreign slots create diversity ----------------------------------------
const foreignCount = sel.trace.filter((t) => t.phase === 'foreign').length;
assert.equal(foreignCount, FOREIGN_SLOTS, 'foreign slots filled with dissimilar memories');
ok(`foreign slots (${FOREIGN_SLOTS}) inject in-query diversity`);

// --- distinct-verifier inhibitory node -------------------------------------
assert.throws(() => requireDistinctVerifier('hermes', 'hermes'), /Inhibitory node violation/);
assert.throws(() => requireDistinctVerifier('Hermes', 'hermes'), /violation/, 'case-insensitive');
assert.ok(requireDistinctVerifier('producer', 'verifier'));
assert.equal(pickVerifier('hermes', ['hermes', 'athena']), 'athena');
assert.throws(() => pickVerifier('solo', ['solo']), /no distinct verifier/);
ok('inhibitory node: verifier must differ from producer');

// --- foreign-input feed is deterministic & source-safe ----------------------
assert.equal(pickForeignDomain(new Date('2026-08-02T00:00:00Z')).id, FOREIGN_DOMAINS[0].id);
const concept = buildForeignConcept(FOREIGN_DOMAINS[0], []);
assert.ok(concept.label.startsWith('Foreign input:'), 'concept built with zero sources');
assert.equal(concept.source, 'foreign-input-feed');
ok('foreign-input feed: deterministic pick, safe on empty search');

console.log(`\nAXON Inhibitor: ${passed} checks passed.`);
