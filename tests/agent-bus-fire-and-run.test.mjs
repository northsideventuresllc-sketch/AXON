#!/usr/bin/env node
/**
 * AXON Agent Bus — proves the fix for "agents cannot actually make each other do work"
 * (the gap left open by PR #140, commit f4a8a8c): fireAgent() must not just record a
 * dispatch row, it must synchronously run the target agent's turn, persist its reply
 * through the same insert path an ordinary chat reply uses, and only THEN resolve the
 * dispatch — all inside the existing (unmodified, still-tested-separately in
 * tests/agent-bus-loop-guards.test.mjs) loop guards and wall-clock budget.
 *
 * No network calls: global.fetch is mocked per-table/per-host, same pattern as
 * tests/runpod-tier.test.mjs and tests/telegram-handler-fire-gate.test.mjs.
 *
 * Run: node tests/agent-bus-fire-and-run.test.mjs
 */
import assert from 'node:assert/strict';
import { fireAgent, MAX_FANOUT_DEPTH } from '../lib/axon-agent-bus.mjs';

process.env.SUPABASE_SERVICE_KEY = 'fake-supabase-key';
process.env.GEMINI_API_KEY = 'fake-gemini-key'; // loadSecret() checks env first — no
// ni_platform_secrets round-trip needed to reach the (mocked) provider call.

const FROM_AGENT = 'agent-a';
const TO_AGENT = 'agent-b';
const TARGET = { id: TO_AGENT, name: 'Agent B', role: 'researcher', venture_id: 'venture-1' };
const REPLY_TEXT = 'Staging looks healthy: every check is green.';

function jsonOk(body) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

/**
 * @param {object} opts
 * @param {number} [opts.geminiDelayMs] - artificial delay before the "provider" replies,
 *   to exercise the wall-clock timeout path
 */
function makeFetchMock({ geminiDelayMs = 0 } = {}) {
  const calls = [];
  const inserts = [];
  const patches = [];

  const handler = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u}`);
    const bodyIn = opts.body ? JSON.parse(opts.body) : {};

    if (u.includes('/axon_venture_agents')) {
      return jsonOk([{ ...TARGET, config: { instructions: 'Be a careful, concise researcher.' } }]);
    }
    if (u.includes('/golden_skills')) return jsonOk([{ skill_name: 'nvg-operator-core' }]);
    if (u.includes('/v_boot')) {
      return jsonOk([
        { rules: { version: 'v1' }, switches: { fire_mode: 'HOLD' }, health: { summary: 'ok' }, booted_at: 'now' },
      ]);
    }
    if (u.includes('/nvg_agent_authority')) return jsonOk([]);
    if (u.includes('/session_notes_apartment')) return jsonOk([]);
    if (u.includes('/router_routes')) {
      return jsonOk([
        {
          id: 'route-gemini',
          name: 'gemini-mock',
          base_url: 'https://generativelanguage.googleapis.com',
          secret_key: 'GEMINI_API_KEY',
          enabled: true,
          connector_kind: 'api',
        },
      ]);
    }
    if (u.includes('/router_models')) {
      return jsonOk([
        {
          id: 'lane-gemini',
          route_id: 'route-gemini',
          model: 'gemini-1.5-flash',
          enabled: true,
          capabilities: ['cheap_chat'],
          cost_tier: 1,
          is_safety_net: false,
          priority: 1,
        },
      ]);
    }
    if (u.includes('/router_health')) return jsonOk(method === 'GET' ? [] : { id: 'health-1' });
    if (u.includes('/axon_router_decisions')) return jsonOk([{ id: 'decision-1' }]);
    if (u.includes('/axon_cost_ledger')) return jsonOk({ ok: true });
    if (u.includes('generativelanguage.googleapis.com')) {
      if (geminiDelayMs > 0) await new Promise((r) => setTimeout(r, geminiDelayMs));
      return jsonOk({ candidates: [{ content: { parts: [{ text: REPLY_TEXT }] } }] });
    }
    if (u.includes('/axon_agent_messages')) {
      const row = { id: `msg-${inserts.length + 1}`, ...bodyIn };
      inserts.push(row);
      return jsonOk([row]);
    }
    if (u.includes('/agent_bus')) {
      if (method === 'PATCH') {
        patches.push({ url: u, values: bodyIn });
        return jsonOk({ id: 'bus-1', ...bodyIn });
      }
      const row = { id: 'bus-1', ...bodyIn };
      inserts.push(row);
      return jsonOk([row]);
    }
    throw new Error(`unexpected fetch in test: ${method} ${u}`);
  };

  return { handler, calls, inserts, patches };
}

async function withMockedFetch(mock, fn) {
  const original = global.fetch;
  global.fetch = mock.handler;
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

async function run() {
  // --- 1. THE fix: A fires B, B's turn actually executes, its reply is persisted, and
  //        the dispatch resolves — none of that was true before this change (fireAgent
  //        used to return right after the two inserts below, never touching routeChat).
  {
    const mock = makeFetchMock();
    const result = await withMockedFetch(mock, () =>
      fireAgent({
        fromAgentId: FROM_AGENT,
        toAgentId: TO_AGENT,
        task: 'Check whether the staging environment is healthy and summarize findings.',
      }),
    );

    assert.equal(result.ok, true, 'fire must succeed');
    assert.equal(result.resolved, true, 'the dispatch must be marked resolved once the turn actually completed');
    assert.equal(result.reply, REPLY_TEXT, "fireAgent must hand back the target turn's real reply");
    assert.ok(result.replyMessageId, 'the reply must have been persisted (got an id back)');

    // The reply landed through the SAME axon_agent_messages insert path as any ordinary
    // chat reply (see app/api/axon-v0/agent-chat/route.ts's addMessage call): same table,
    // same thread convention, sender = the agent's own name, content = its reply text.
    const replyRow = mock.inserts.find(
      (r) => r.sender === TARGET.name && r.thread === `agent-${TO_AGENT}` && r.content === REPLY_TEXT,
    );
    assert.ok(replyRow, 'B’s reply must be persisted into axon_agent_messages under its own thread/sender');

    // The task delivery message (fromAgentId -> target's inbox) is untouched from before.
    const taskRow = mock.inserts.find((r) => r.sender === FROM_AGENT && r.content?.includes('staging environment'));
    assert.ok(taskRow, 'the original task must still land in the target’s inbox thread');

    // The dispatch (agent_bus) row must have been resolved — status flips to 'answered'
    // ONLY on real completion (requirement 4), never pre-emptively.
    const resolvePatch = mock.patches.find((p) => p.values.status === 'answered');
    assert.ok(resolvePatch, 'agent_bus must be patched to status=answered once the reply is persisted');
    assert.equal(resolvePatch.values.answered_by, TARGET.name);
    assert.equal(resolvePatch.values.body?.progress?.state, 'completed');

    // A progress patch to 'running' must have happened before the resolve patch — this is
    // the "progress row per hop" requirement: the hop's own row shows it was in flight.
    const runningPatch = mock.patches.find((p) => p.values.body?.progress?.state === 'running');
    assert.ok(runningPatch, 'the agent_bus row must show a running state while the turn is in flight');
  }

  // --- 2. Guard reuse: the synchronous path must still refuse a depth past
  //        MAX_FANOUT_DEPTH BEFORE touching the network at all — proves the new
  //        "run the turn" code sits INSIDE checkLoopGuards, not around it. If fireAgent's
  //        new synchronous-run code path were ever wired ahead of the guard check, this
  //        would either throw (network hit with nothing mocked) or wrongly resolve.
  {
    const mock = makeFetchMock();
    const result = await withMockedFetch(mock, () =>
      fireAgent({
        fromAgentId: FROM_AGENT,
        toAgentId: TO_AGENT,
        task: 'go three generations deep',
        depth: MAX_FANOUT_DEPTH + 1,
      }),
    );
    assert.equal(result.ok, false, 'a fan-out depth past MAX_FANOUT_DEPTH must still be refused');
    assert.match(result.reason, /fan-out depth/);
    assert.equal(mock.calls.length, 0, 'a guard refusal must happen before any network call, sync-turn or not');
  }

  // --- 3. Wall-clock budget: a chain that would blow the budget must NOT resolve, and
  //        must leave an honest reason behind instead of silently hanging or lying about
  //        completion (requirements 2 + 4 together).
  {
    const mock = makeFetchMock({ geminiDelayMs: 150 });
    const result = await withMockedFetch(mock, () =>
      fireAgent({
        fromAgentId: FROM_AGENT,
        toAgentId: TO_AGENT,
        task: 'Check whether the staging environment is healthy and summarize findings.',
        chainBudgetMs: 30, // far shorter than the mocked 150ms provider delay
      }),
    );

    assert.equal(result.ok, true, 'the dispatch itself must still have been recorded');
    assert.equal(result.resolved, false, 'a chain that blew its wall-clock budget must NOT be marked resolved');
    assert.match(result.reason, /timed out|budget/i, 'the un-resolved reason must say why, not just fail silently');

    const resolvePatch = mock.patches.find((p) => p.values.status === 'answered');
    assert.equal(resolvePatch, undefined, 'a timed-out hop must never be patched to status=answered');
    const timeoutPatch = mock.patches.find((p) => p.values.body?.progress?.state === 'timeout');
    assert.ok(timeoutPatch, 'the progress row must record the timeout state so the stall is visible, not silent');
  }

  console.log('agent-bus-fire-and-run: all 3 checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
