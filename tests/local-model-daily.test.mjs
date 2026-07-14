#!/usr/bin/env node
/**
 * Local model daily helpers — run: node tests/local-model-daily.test.mjs
 */
import assert from 'node:assert/strict';
import {
  buildDailyDataset,
  heuristicScoreLead,
  macCronChecklist,
  probeOllama,
  runLocalModelDaily,
  scoreLeadBatch,
} from '../lib/local-model-daily.mjs';

const exclusionLead = {
  id: '1',
  handle: 'Indeed Recruiting Agency Jobs',
  niche: 'staffing',
  why_match_fit: 'job board listing for recruiters',
  status: 'pending_approval',
};
const exclusion = heuristicScoreLead(exclusionLead);
assert.equal(exclusion.score, 0);
assert.equal(exclusion.queue, false);

const goodLead = {
  id: '2',
  handle: 'Acme Freight Brokerage',
  niche: 'freight',
  target_group: 'smb',
  why_match_fit: 'Founder drowning in manual back-office workflow and ops compliance',
  comment_draft: 'Saw your freight ops bottlenecks…',
  status: 'pending_approval',
};
const good = heuristicScoreLead(goodLead, {
  topRejectReasons: [{ reason: 'recruiting agency', count: 3 }],
});
assert.ok(good.score >= 55, `expected queueable score, got ${good.score}`);
assert.equal(good.queue, true);

const dataset = buildDailyDataset(
  [
    { field_name: 'reject_reason', after_value: 'recruiting agency' },
    { field_name: 'comment_draft', before_value: 'a', after_value: 'b' },
  ],
  [goodLead],
);
assert.equal(dataset.signalCount, 2);
assert.equal(dataset.leadCount, 1);
assert.ok(dataset.phase1.pipeline.includes('follow-up'));
assert.match(dataset.phase1.interactivity, /AXON/);

const fakeFetch = async () => {
  throw new Error('network down');
};
const probe = await probeOllama({ fetchImpl: fakeFetch, timeoutMs: 50 });
assert.equal(probe.available, false);

const batch = await scoreLeadBatch({
  leads: [goodLead, exclusionLead],
  training: { topRejectReasons: [{ reason: 'recruiting agency' }] },
  probe,
  preferHeuristic: true,
});
assert.equal(batch.provider, 'heuristic');
assert.equal(batch.scored.length, 2);
assert.ok(batch.avgScore !== null);

const run = await runLocalModelDaily({
  signals: [{ field_name: 'reject_reason', after_value: 'recruiting agency' }],
  leads: [goodLead],
  training: { topRejectReasons: [{ reason: 'recruiting agency' }] },
  dryRun: true,
  forceHeuristic: true,
  fetchImpl: fakeFetch,
});
assert.equal(run.ok, true);
assert.equal(run.dryRun, true);
assert.equal(run.persisted, null);
assert.match(run.summary, /heuristic|Local daily model/i);

const checklist = macCronChecklist();
assert.ok(checklist.length >= 6);
assert.ok(checklist.some((line) => line.includes('ollama pull')));
assert.ok(checklist.some((line) => line.includes('Phase 1')));

console.log('local-model-daily.test.mjs OK');
