#!/usr/bin/env node
/**
 * AXON v0 roster Fire — Phase 2 lane A4 (agentic-os-phase2-harness-usage.md Phase A4).
 * Proves decideRosterFireRoute (pure, no I/O) picks the right dispatch route per
 * wake_type and refuses everything it should, then proves fireRosterAgent actually
 * writes the rows the dispatch-by-route contract promises, with global.fetch mocked —
 * same mocking shape as tests/mini-jobs-tier-gate.test.mjs.
 *
 * Run: node tests/roster-fire-decision.test.mjs
 */
import assert from 'node:assert/strict';
import { decideRosterFireRoute, fireRosterAgent, NODE_SCRIPT_CMD_RE } from '../lib/axon-roster-fire.mjs';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'fake-key-for-tests';

// --- 1. missing / retired rows are refused ------------------------------------------
{
  assert.equal(decideRosterFireRoute(null).ok, false);
  assert.equal(decideRosterFireRoute({}).ok, false);

  const retired = decideRosterFireRoute({ agent_name: 'X', retired_at: '2026-09-02T00:00:00Z', wake_type: 'dispatch_queue' });
  assert.equal(retired.ok, false);
  assert.match(retired.reason, /retired/i);
}

// --- 2. routine_api: needs a live fire_token + non-PENDING routine_id ----------------
{
  const noToken = decideRosterFireRoute({ agent_name: 'ARCEUS', wake_type: 'routine_api', routine_id: 'r1', fire_token: null });
  assert.equal(noToken.ok, false);
  assert.match(noToken.reason, /no live API trigger/i);

  const pending = decideRosterFireRoute({ agent_name: 'X', wake_type: 'routine_api', routine_id: 'PENDING-123', fire_token: 'tok' });
  assert.equal(pending.ok, false);

  const ok = decideRosterFireRoute({ agent_name: 'ARCEUS', wake_type: 'routine_api', routine_id: 'r1', fire_token: 'tok' });
  assert.equal(ok.ok, true);
  assert.equal(ok.route, 'routine_api');
}

// --- 3. dispatch_queue: always allowed (the queue itself is the gate) ----------------
{
  const ok = decideRosterFireRoute({ agent_name: 'AXON-Translator', wake_type: 'dispatch_queue', wake_config: {} });
  assert.equal(ok.ok, true);
  assert.equal(ok.route, 'dispatch_queue');
}

// --- 4. mac_mini/local_only: refuses empty cmds, refuses non-node-script cmds --------
{
  const empty = decideRosterFireRoute({ agent_name: 'X', wake_type: 'local_only', wake_config: {} });
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /no runnable command/i);

  const dangerous = decideRosterFireRoute({
    agent_name: 'X',
    wake_type: 'mac_mini',
    wake_config: { cmds: ['node scripts/axon-self-research.mjs', 'rm -rf /'] },
  });
  assert.equal(dangerous.ok, false);
  assert.match(dangerous.reason, /node scripts/);

  const good = decideRosterFireRoute({
    agent_name: 'X',
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/a.mjs --dry', 'node scripts/b.mjs'] },
  });
  assert.equal(good.ok, true);
  assert.equal(good.route, 'mac_mini');
  assert.equal(good.cmd, 'node scripts/a.mjs --dry && node scripts/b.mjs');
  assert.ok(good.cmd.split(' && ').every((c) => NODE_SCRIPT_CMD_RE.test(c)));
}

// --- 5. supabase: needs wake_config.fn -----------------------------------------------
{
  const noFn = decideRosterFireRoute({ agent_name: 'X', wake_type: 'supabase', wake_config: {} });
  assert.equal(noFn.ok, false);

  const ok = decideRosterFireRoute({ agent_name: 'X', wake_type: 'supabase', wake_config: { fn: 'fn_dispatch_reaper' } });
  assert.equal(ok.ok, true);
  assert.equal(ok.route, 'supabase');
  assert.equal(ok.fn, 'fn_dispatch_reaper');
}

// --- 6. an unsupported/unknown wake_type is a plain-English 422, never a silent allow --
{
  const gh = decideRosterFireRoute({ agent_name: 'X', wake_type: 'github_actions', wake_config: {} });
  assert.equal(gh.ok, false);
  assert.match(gh.reason, /isn't a wake type this fire route supports/);

  const unset = decideRosterFireRoute({ agent_name: 'X', wake_type: null });
  assert.equal(unset.ok, false);
}

// --- 7. fireRosterAgent (mocked fetch): dispatch_queue writes agent_dispatch + trace rows
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    posts.push({ url: String(url), method: opts?.method || 'GET', body });
    if (String(url).includes('nvg_agent_authority')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [{ id: 'row-1' }] };
  };

  const row = { agent_name: 'AXON-Translator', wake_type: 'dispatch_queue', wake_config: {}, retired_at: null };
  const result = await fireRosterAgent(row, 'run the translator scan');
  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  assert.equal(result.how, 'dispatch_queue');

  const dispatchPost = posts.find((p) => p.url.includes('/agent_dispatch') && p.method === 'POST');
  assert.ok(dispatchPost, 'must insert an agent_dispatch row');
  assert.equal(dispatchPost.body.owner, 'AXON-Translator');
  assert.equal(dispatchPost.body.status, 'queued');
  assert.equal(dispatchPost.body.source, 'axon-v0-fire');

  const busPost = posts.find((p) => p.url.includes('/agent_bus') && p.method === 'POST');
  assert.ok(busPost, 'must insert one agent_bus trace row');
  assert.equal(busPost.body.from_agent, 'AXON-v0-Dash');
  assert.equal(busPost.body.to_agent, 'AXON-Translator');

  const taskLogPost = posts.find((p) => p.url.includes('/agent_task_log') && p.method === 'POST');
  assert.ok(taskLogPost, 'must insert one agent_task_log row');
}

// --- 8. fireRosterAgent: merge/deploy-class note without live authority is refused ----
{
  const posts = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    posts.push({ url: String(url), method: opts?.method || 'GET', body });
    if (String(url).includes('nvg_agent_authority')) return { ok: true, json: async () => [] }; // no authority row
    return { ok: true, json: async () => [{ id: 'row-1' }] };
  };

  const row = { agent_name: 'BUILD', wake_type: 'dispatch_queue', wake_config: {}, retired_at: null };
  const result = await fireRosterAgent(row, 'merge and deploy the pending PR');
  global.fetch = originalFetch;

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /no live (merge|deploy) authority/);
  assert.equal(posts.some((p) => p.url.includes('/agent_dispatch') && p.method === 'POST'), false, 'must not queue when authority is refused');
}

console.log('roster-fire-decision.test.mjs: all assertions passed');
