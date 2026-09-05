#!/usr/bin/env node
/**
 * AXON Deploy QA core tests — run: node tests/axon-deploy-qa-core.test.mjs
 *
 * Pure-function coverage for lib/axon-deploy-qa-core.mjs (AX-SMALL-BUILDS-BUNDLE-0904
 * item 1). No network, no fs, no git — mirrors tests/axon-cron-guard.test.mjs's style.
 */
import assert from 'node:assert/strict';
import {
  shortSha,
  extractPlanText,
  summarizeChecks,
  verdictFromChecks,
  renderQaEntry,
  withNewEntry,
  buildLearningRow,
} from '../lib/axon-deploy-qa-core.mjs';

// ---------- shortSha ----------
assert.equal(shortSha('abcdef1234567890'), 'abcdef1');
assert.equal(shortSha(''), '');
assert.equal(shortSha(undefined), '');

// ---------- extractPlanText ----------
assert.equal(
  extractPlanText({ pr: { body: '  Do the thing  ' }, commitMessage: 'ignored' }),
  'Do the thing',
  'PR body wins when present',
);
assert.equal(
  extractPlanText({ pr: { body: '', title: 'Fix the thing' }, commitMessage: 'ignored' }),
  'Fix the thing',
  'falls back to PR title when body is empty',
);
assert.equal(
  extractPlanText({ pr: null, commitMessage: 'fix: direct push commit' }),
  'fix: direct push commit',
  'falls back to commit message when no PR',
);
assert.equal(
  extractPlanText({ pr: null, commitMessage: '' }),
  '(no PR body/title or commit message found — plan unknown)',
  'honest about not knowing the plan rather than inventing one',
);
{
  const long = 'x'.repeat(2000);
  const truncated = extractPlanText({ pr: { body: long }, commitMessage: '' });
  assert.ok(truncated.length <= 1200, 'plan text is capped');
  assert.ok(truncated.endsWith('…'), 'truncation is marked, not silent');
}

// ---------- summarizeChecks / verdictFromChecks ----------
{
  const summary = summarizeChecks([]);
  assert.equal(summary.total, 0);
  const { verdict, reason } = verdictFromChecks(summary);
  assert.equal(verdict, 'UNKNOWN');
  assert.match(reason, /no check-runs/);
}
{
  const summary = summarizeChecks([
    { name: 'build', conclusion: 'success' },
    { name: 'lint', conclusion: 'success' },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 0);
  const { verdict } = verdictFromChecks(summary);
  assert.equal(verdict, 'PASS');
}
{
  const summary = summarizeChecks([
    { name: 'build', conclusion: 'success' },
    { name: 'lint', conclusion: 'failure' },
  ]);
  const { verdict, reason } = verdictFromChecks(summary);
  assert.equal(verdict, 'NEEDS REVIEW');
  assert.match(reason, /1 of 2/);
}
{
  const summary = summarizeChecks([{ name: 'build', status: 'in_progress', conclusion: null }]);
  const { verdict, reason } = verdictFromChecks(summary);
  assert.equal(verdict, 'NEEDS REVIEW');
  assert.match(reason, /still pending/);
}

// ---------- renderQaEntry ----------
{
  const md = renderQaEntry({
    sha: 'deadbeef1234',
    dateIso: '2026-09-05',
    commitMessage: 'fix: correct thing\n\nlonger body',
    pr: { number: 42, title: 'Fix the thing', html_url: 'https://example.com/pr/42', body: 'Plan: fix the thing' },
    checkRuns: [{ name: 'build', conclusion: 'success' }],
    filesChanged: ['a.mjs', 'b.mjs'],
  });
  assert.match(md, /## Deploy deadbee/);
  assert.match(md, /#42 — Fix the thing/);
  assert.match(md, /Plan: fix the thing/);
  assert.match(md, /### Verdict: PASS/);
  assert.match(md, /- a\.mjs/);
}
{
  const md = renderQaEntry({ sha: 'abc1234', dateIso: '2026-09-05', commitMessage: 'direct push', pr: null, checkRuns: [], filesChanged: [] });
  assert.match(md, /no associated PR found/);
  assert.match(md, /### Verdict: UNKNOWN/);
}

// ---------- withNewEntry ----------
{
  const v1 = withNewEntry('', 'entry-1');
  assert.match(v1, /# AXON Deploy QA/);
  assert.match(v1, /entry-1/);

  const v2 = withNewEntry(v1, 'entry-2');
  assert.ok(v2.indexOf('entry-2') < v2.indexOf('entry-1'), 'newest entry is prepended');

  // cap enforcement
  let content = '';
  for (let i = 0; i < 50; i++) content = withNewEntry(content, `entry-${i}`);
  const entryCount = (content.match(/entry-\d+/g) || []).length;
  assert.ok(entryCount <= 40, `entries capped at 40, got ${entryCount}`);
}

// ---------- buildLearningRow ----------
{
  const row = buildLearningRow({ sha: 'abcdef1234', verdict: 'PASS', reason: 'all good', prNumber: 7 });
  assert.equal(row.source, 'axon-deploy-qa');
  assert.equal(row.category, 'axon-deploy-qa');
  assert.equal(row.project, 'AXON');
  assert.match(row.learning, /\[AXON-DEPLOY-QA\] deploy abcdef1 \(PR #7\): PASS/);
}

console.log('axon-deploy-qa-core: all assertions passed.');
