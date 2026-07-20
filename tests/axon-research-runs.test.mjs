#!/usr/bin/env node
/**
 * AX-RESEARCH-RUNS + AX-SELF-RESEARCH-FIX — run: node tests/axon-research-runs.test.mjs
 */
import assert from 'node:assert/strict';
import {
  RESEARCH_RUN_TABLE,
  buildResearchRunLabLog,
  countRunsThisWeek,
  fetchRecentResearchRuns,
  heuristicSynthesis,
  isHardQuotaError,
  isResearchForceEnabled,
  isTransientResearchError,
  pickResearchLane,
  writeResearchRunLabLog,
} from '../lib/axon-research-core.mjs';

assert.equal(RESEARCH_RUN_TABLE, 'axon_research_runs');

const completed = buildResearchRunLabLog({
  lane: 'ai_models',
  findingsCount: 3,
  briefingItemsAdded: 2,
  status: 'completed',
  meta: { source_count: 5 },
});
assert.equal(completed.operator_id, 'default');
assert.equal(completed.lane, 'ai_models');
assert.equal(completed.findings_count, 3);
assert.equal(completed.briefing_items_added, 2);
assert.equal(completed.status, 'completed');
assert.match(completed.summary, /ai_models/);
assert.match(completed.summary, /3 finding/);
assert.equal(completed.meta.brand, 'NORTHSiDE');
assert.equal(completed.meta.operator, 'JB');
assert.equal(completed.meta.job_code, 'AX-RESEARCH-RUNS');
assert.equal(completed.meta.source_count, 5);

const skipped = buildResearchRunLabLog({
  lane: 'open_source',
  status: 'skipped',
  errorMessage: '4/4 completed runs already this week',
});
assert.equal(skipped.status, 'skipped');
assert.match(skipped.summary, /skipped/);
assert.match(skipped.error_message, /4\/4/);

const failed = buildResearchRunLabLog({
  lane: 'neuroscience',
  status: 'failed',
  errorMessage: 'Anthropic HTTP 529',
});
assert.equal(failed.status, 'failed');
assert.match(failed.summary, /failed/);
assert.match(failed.error_message, /529/);

const backdated = buildResearchRunLabLog({
  lane: 'ai_models',
  findingsCount: 4,
  status: 'completed',
  createdAt: '2026-07-11T11:58:45.000Z',
  summary: 'Backfill from historical findings',
});
assert.equal(backdated.created_at, '2026-07-11T11:58:45.000Z');
assert.equal(backdated.summary, 'Backfill from historical findings');

const inserted = [];
const fakeInsert = async (table, row) => {
  assert.equal(table, RESEARCH_RUN_TABLE);
  inserted.push(row);
  return { id: 'run-1', ...row };
};
const written = await writeResearchRunLabLog(fakeInsert, {
  lane: 'ai_models',
  findingsCount: 2,
  briefingItemsAdded: 1,
  status: 'completed',
});
assert.equal(written.id, 'run-1');
assert.equal(inserted.length, 1);

const fakeSelect = async (table, filter) => {
  assert.equal(table, RESEARCH_RUN_TABLE);
  if (filter.includes('status=eq.completed')) {
    return [{ id: 'a' }, { id: 'b' }];
  }
  return [
    { id: 'r1', lane: 'ai_models', status: 'completed' },
    { id: 'r2', lane: 'open_source', status: 'skipped' },
  ];
};
assert.equal(await countRunsThisWeek(fakeSelect), 2);
const recent = await fetchRecentResearchRuns(fakeSelect, 'default', 12);
assert.equal(recent.length, 2);

const lane = pickResearchLane(new Date('2026-07-13T12:00:00Z')); // Monday UTC
assert.ok(['ai_models', 'open_source', 'neuroscience'].includes(lane));

// AX-SELF-RESEARCH-FIX helpers
assert.equal(isResearchForceEnabled({ AXON_RESEARCH_FORCE: 'false' }), false);
assert.equal(isResearchForceEnabled({ AXON_RESEARCH_FORCE: '' }), false);
assert.equal(isResearchForceEnabled({ AXON_RESEARCH_FORCE: 'true' }), true);
assert.equal(isResearchForceEnabled({ AXON_RESEARCH_FORCE: '1' }), true);

assert.equal(
  isHardQuotaError(
    new Error(
      'Anthropic HTTP 400: {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}'
    )
  ),
  true
);
assert.equal(isHardQuotaError(new Error('Anthropic HTTP 529 overload')), false);
assert.equal(isTransientResearchError(new Error('Anthropic HTTP 529')), true);
assert.equal(isTransientResearchError(new Error('credit balance is too low')), false);

const heuristic = heuristicSynthesis('ai_models', [
  {
    title: 'Agent memory architecture',
    link: 'https://example.com/memory',
    snippet: 'Persistent workspace memory for agents.',
  },
]);
assert.equal(heuristic._provider, 'heuristic');
assert.ok(heuristic.findings.length >= 1);
assert.match(heuristic.findings[0].title, /Agent memory/);
assert.match(heuristic.briefing_headline, /heuristic/);
assert.equal(heuristic.jspace_concepts.length, 1);

console.log('axon-research-runs.test.mjs: all assertions passed');
