#!/usr/bin/env node
/**
 * AX-MINI-JOBS-NO-TIER-GATE-0813 — proves the risk gate actually enforces the EXEC
 * decision (agent_bus, 2026-08-18): an unmatched/unrecognized shell payload must not be
 * written with status:'queued' (what nvg-mini-runner.py polls for and executes); it must
 * instead be blocked (nvg_mini_jobs status:'blocked_needs_jb') and mirrored into
 * agent_dispatch with needs_jb_approval:true. Allowlisted templates (the Ollama local
 * generate curl, and the vendor subscription CLIs) still queue normally, now carrying
 * risk_flag/risk_reason for audit.
 *
 * Run: node tests/mini-jobs-tier-gate.test.mjs
 */
import assert from 'node:assert/strict';
import { classifyMiniShellRisk } from '../lib/nvg-mini-risk-gate.mjs';
import { queueMiniShellJob } from '../lib/nvg-mini-queue.mjs';
import { callAxonLocal } from '../lib/axon-local-relay.mjs';

// --- 1. classifier: allowlisted templates come back low / allowlisted -----------------
{
  const ollama = classifyMiniShellRisk('curl -s -m 40 http://localhost:11434/api/generate -d {"model":"x"}');
  assert.equal(ollama.riskFlag, 'low');
  assert.equal(ollama.allowlisted, true);

  const claude = classifyMiniShellRisk(`claude -p 'hello' --output-format json`);
  assert.equal(claude.riskFlag, 'low');
  const codex = classifyMiniShellRisk(`codex exec 'hello' --json`);
  assert.equal(codex.riskFlag, 'low');
  const gemini = classifyMiniShellRisk(`gemini -p 'hello'`);
  assert.equal(gemini.riskFlag, 'low');
}

// --- 2. classifier: anything else defaults high, never null/allow --------------------
{
  const arbitrary = classifyMiniShellRisk('rm -rf /some/path');
  assert.equal(arbitrary.riskFlag, 'high');
  assert.equal(arbitrary.allowlisted, false);

  const empty = classifyMiniShellRisk('');
  assert.equal(empty.riskFlag, 'high');

  const nonString = classifyMiniShellRisk(undefined);
  assert.equal(nonString.riskFlag, 'high');
}

// --- 3. queueMiniShellJob: unmatched cmd never reaches status:'queued' ----------------
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    posts.push({ url: String(url), body });
    return { ok: true, json: async () => [] };
  };

  const result = await queueMiniShellJob('fake-key', 'rm -rf /whatever', { title: 'danger job' });
  global.fetch = originalFetch;

  assert.equal(result, null, 'blocked job must return null, same contract as any other failure');
  assert.equal(posts.length, 2, 'exactly one nvg_mini_jobs audit insert + one agent_dispatch insert, no queued job');

  const miniJobsPost = posts.find((p) => p.url.includes('nvg_mini_jobs'));
  assert.ok(miniJobsPost, 'must still write an audit row to nvg_mini_jobs');
  assert.equal(miniJobsPost.body.status, 'blocked_needs_jb', 'must never be status:"queued"');
  assert.equal(miniJobsPost.body.risk_flag, 'high');
  assert.ok(miniJobsPost.body.risk_reason?.length > 0);

  const dispatchPost = posts.find((p) => p.url.includes('agent_dispatch'));
  assert.ok(dispatchPost, 'must mirror into agent_dispatch so JB sees it');
  assert.equal(dispatchPost.body.needs_jb_approval, true);
  assert.equal(dispatchPost.body.status, 'needs_jb');
  assert.equal(dispatchPost.body.risk_tier, 'jb_only');
  assert.equal(dispatchPost.body.executor, 'jb_manual');
  // must satisfy agent_dispatch_owner_check / action_type / queued_by CHECK constraints
  assert.ok(['manager','runner','hermes','fable','PULSE','DESK','BUILD','REACH','SENSEI','COUNCIL','ARCEUS'].includes(dispatchPost.body.owner));
  assert.ok(['manager_phrase','workflow','relay','none'].includes(dispatchPost.body.action_type));
  assert.ok(['registry','hermes','manager','agent','jb'].includes(dispatchPost.body.queued_by));
}

// --- 4. queueMiniShellJob: allowlisted cmd still queues, now carrying risk_flag -------
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    posts.push({ url: String(url), body });
    if (String(url).includes('nvg_mini_jobs') && opts.method === 'POST') {
      return { ok: true, json: async () => [{ id: 42 }] };
    }
    // poll -> resolve immediately as done so the test doesn't wait out the real poll loop
    return { ok: true, json: async () => [{ status: 'done', result: { stdout: 'ok' } }] };
  };

  const result = await queueMiniShellJob(
    'fake-key',
    `claude -p 'hello' --output-format json`,
    { title: 'subscription-cli-claude', maxWaitMs: 5_000, timeoutS: 5 },
  );
  global.fetch = originalFetch;

  assert.equal(result, 'ok');
  const insertPost = posts.find((p) => p.body?.status === 'queued');
  assert.ok(insertPost, 'allowlisted job must still be queued');
  assert.equal(insertPost.body.risk_flag, 'low');
  assert.ok(insertPost.body.risk_reason?.includes('subscription-cli-claude'));
}

// --- 5. callAxonLocal: fixed Ollama template queues normally with risk_flag -----------
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    posts.push({ url: String(url), body });
    if (String(url).includes('nvg_mini_jobs') && opts.method === 'POST') {
      return { ok: true, json: async () => [{ id: 7 }] };
    }
    return {
      ok: true,
      json: async () => [{ status: 'done', result: { stdout: JSON.stringify({ response: 'hi there' }) } }],
    };
  };

  const text = await callAxonLocal('fake-key', 'system prompt', 'user prompt');
  global.fetch = originalFetch;

  assert.equal(text, 'hi there');
  const insertPost = posts.find((p) => p.body?.status === 'queued');
  assert.ok(insertPost, 'the fixed Ollama template must still queue');
  assert.equal(insertPost.body.risk_flag, 'low');
  assert.ok(insertPost.body.risk_reason?.includes('ollama-local-generate'));
}

console.log('mini-jobs-tier-gate.test.mjs: all assertions passed');
