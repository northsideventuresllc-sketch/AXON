#!/usr/bin/env node
/**
 * AX-MINI-JOBS-NO-TIER-GATE-0813 -- COUNCIL-DECIDED 2026-09-25 3-way tier.
 * Proves classifyMiniShellRiskTier() and queueMiniShellJob() enforce:
 *   allowlisted read-only        -> low/auto    -> queued, mini runs it
 *   write/install (reversible)   -> medium/council -> nvg_mini_jobs NOT queued,
 *                                    agent_dispatch owner=COUNCIL, needs_jb_approval=false
 *   delete/paid-install/secret,
 *   or fully unmatched           -> high/jb     -> unchanged JB routing (existing behavior)
 *
 * Run: node tests/mini-jobs-council-tier.test.mjs
 */
import assert from 'node:assert/strict';
import { classifyMiniShellRiskTier } from '../lib/nvg-mini-risk-gate.mjs';
import { queueMiniShellJob } from '../lib/nvg-mini-queue.mjs';

// --- 1. classifier: low tier still auto ------------------------------------------------
{
  const ollama = classifyMiniShellRiskTier(`curl -s -m 40 http://localhost:11434/api/generate -d '{"model":"x"}'`);
  assert.equal(ollama.tier, 'low');
  assert.equal(ollama.route, 'auto');
}

// --- 2. classifier: write/install shapes -> medium/council ------------------------------
{
  const cases = [
    'git add . && git commit -m "wip"',
    'git push origin main',
    'npm install left-pad',
    'pip install requests',
    'mkdir -p /tmp/foo',
    'touch /tmp/foo/bar.txt',
    'mv /tmp/a /tmp/b',
    'cp /tmp/a /tmp/b',
    `curl -X POST https://example.com/api -d '{"x":1}'`,
  ];
  for (const cmd of cases) {
    const r = classifyMiniShellRiskTier(cmd);
    assert.equal(r.tier, 'medium', `expected medium for: ${cmd}`);
    assert.equal(r.route, 'council', `expected council route for: ${cmd}`);
  }
}

// --- 3. classifier: delete/paid/secret shapes -> high/jb, NOT council -------------------
{
  const cases = [
    'rm -rf /some/path',
    'rmdir /tmp/foo',
    'DROP TABLE users;',
    'DELETE FROM users WHERE 1=1;',
    'git push --force origin main',
    'git reset --hard HEAD~5',
    'cat .env',
    'echo $API_KEY',
    'stripe charges create',
    'brew install ffmpeg',
    'npm install -g some-cli',
  ];
  for (const cmd of cases) {
    const r = classifyMiniShellRiskTier(cmd);
    assert.equal(r.tier, 'high', `expected high for: ${cmd}`);
    assert.equal(r.route, 'jb', `expected jb route for: ${cmd}`);
  }
}

// --- 4. classifier: fully unmatched (e.g. bare echo of nothing recognizable) -> high/jb --
{
  const r = classifyMiniShellRiskTier('some-totally-unknown-binary --flag');
  assert.equal(r.tier, 'high');
  assert.equal(r.route, 'jb');
}

// --- 5. queueMiniShellJob: medium-tier cmd never reaches status:'queued', routes COUNCIL -
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    if ((opts?.method || 'GET') === 'POST') posts.push({ url: String(url), body });
    return { ok: true, json: async () => [] };
  };

  const result = await queueMiniShellJob('fake-key', 'npm install left-pad', { title: 'installer job' });
  global.fetch = originalFetch;

  assert.equal(result, null, 'council-routed job must return null, same contract as any other failure');
  assert.equal(posts.length, 2, 'exactly one nvg_mini_jobs audit insert + one agent_dispatch insert, no queued job');

  const miniJobsPost = posts.find((p) => p.url.includes('nvg_mini_jobs'));
  assert.ok(miniJobsPost, 'must still write an audit row to nvg_mini_jobs');
  assert.notEqual(miniJobsPost.body.status, 'queued', 'must never be status:"queued" -- the mini runner would execute it');
  assert.equal(miniJobsPost.body.risk_flag, 'medium');
  assert.match(miniJobsPost.body.risk_reason, /COUNCIL, not JB/);

  const dispatchPost = posts.find((p) => p.url.includes('agent_dispatch'));
  assert.ok(dispatchPost, 'must route into agent_dispatch for COUNCIL review');
  assert.equal(dispatchPost.body.owner, 'COUNCIL');
  assert.equal(dispatchPost.body.status, 'queued');
  assert.equal(dispatchPost.body.risk_tier, 'minor');
  assert.equal(dispatchPost.body.needs_jb_approval, false, 'COUNCIL-tier jobs must never be pinged to JB');
}

// --- 6. queueMiniShellJob: high-tier cmd unchanged (still routes JB, not COUNCIL) -------
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    if ((opts?.method || 'GET') === 'POST') posts.push({ url: String(url), body });
    return { ok: true, json: async () => [] };
  };

  const result = await queueMiniShellJob('fake-key', 'rm -rf /whatever', { title: 'danger job' });
  global.fetch = originalFetch;

  assert.equal(result, null);
  const dispatchPost = posts.find((p) => p.url.includes('agent_dispatch'));
  assert.ok(dispatchPost);
  assert.equal(dispatchPost.body.owner, 'runner', 'delete-shaped commands must still route to the JB card, not COUNCIL');
  assert.equal(dispatchPost.body.needs_jb_approval, true);
}

console.log('mini-jobs-council-tier.test.mjs: all assertions passed');
