#!/usr/bin/env node
/**
 * AX-ROUTER-LOG-FAILURES-0906 (Build Plan A ticket A7): the router never fails silently.
 *
 * Proves:
 *  - axonGenerate, when every tier in the locked chain fails/is unconfigured, still writes
 *    one axon_cost_ledger usage row (cost 0, tokens 0, provider 'none') AND logs one
 *    structured line, before throwing.
 *  - routeChat, when the locked chain AND the whole capability-scored lane pool both fail,
 *    writes one 'total_fallthrough' usage row, logs one structured line, posts a best-effort
 *    #agent-ops Slack line, and still throws (callers must not silently get an empty reply).
 *
 * Run: node tests/axon-router-total-fallthrough.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate, routeChat } from '../lib/axon-router-core.mjs';

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

function withFetch(handler, fn) {
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function withCapturedLogs(fn) {
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return fn(lines).finally(() => {
    console.error = originalConsoleError;
  });
}

function json(data) {
  return { ok: true, status: 200, json: async () => data };
}
function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const msgs = [{ role: 'user', content: 'hi' }];

// --- 1. axonGenerate: every tier fails -> one usage row + one structured log, then throws --
await withCapturedLogs(async (lines) => {
  const calls = [];
  await withFetch(
    async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? safeParse(opts.body) : null });
      if (u.includes('/rest/v1/axon_llm_chain')) {
        // Force the locked default chain but every tier is unresolvable (no routes at all).
        return json([]);
      }
      if (u.includes('/rest/v1/router_routes')) return json([]);
      if (u.includes('/rest/v1/router_models')) return json([]);
      if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
      if (u.includes('/rest/v1/ni_platform_secrets')) return json([]);
      if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
      if (u.includes('/rest/v1/router_health')) return json([]);
      throw new Error(`unmocked fetch in test 1: ${u}`);
    },
    async () => {
      await assert.rejects(
        () => axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, agentName: 'test-agent' }),
        /every tier in the chain failed or was unconfigured/,
      );
    },
  );

  const ledgerCalls = calls.filter((c) => c.url.includes('/rest/v1/axon_cost_ledger'));
  // 5 tiers in the default chain, each "not configured" (no route resolves) -> 5 per-tier
  // rows, PLUS one extra row for the whole-chain failure marker this ticket adds.
  const failureMarkerRows = ledgerCalls.filter((c) => c.body?.provider === 'none');
  assert.equal(failureMarkerRows.length, 1, 'exactly one failure-marker usage row for the exhausted chain');
  const marker = failureMarkerRows[0].body;
  assert.equal(marker.model, null);
  assert.equal(marker.input_tokens, 0);
  assert.equal(marker.output_tokens, 0);
  assert.equal(marker.total_tokens, 0);
  assert.equal(marker.cost_usd, 0);
  assert.equal(marker.agent_name, 'test-agent');
  const notes = JSON.parse(marker.notes);
  assert.equal(notes.status, 'chain_exhausted');
  assert.ok(notes.reason, 'failure marker carries a reason');

  assert.ok(
    lines.some((l) => l.includes('axon_generate_chain_exhausted')),
    'one structured log line for the exhausted chain',
  );
});

// --- 2. routeChat: locked chain fails AND the legacy lane pool fails -> total fallthrough ---
await withCapturedLogs(async (lines) => {
  const calls = [];
  let slackPosted = false;
  await withFetch(
    async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? safeParse(opts.body) : null });

      // Use a code-build capability class so routeChat skips the locked axonGenerate chain
      // entirely and goes straight to the scored lane pool, whose single lane also fails —
      // this isolates the "every lane failed" (legacy pool) path this ticket instruments.
      if (u.includes('/rest/v1/router_routes')) {
        return json([
          { id: 'r1', name: 'test-route', connector_kind: 'api', base_url: 'https://api.example.com/v1', secret_key: 'FAKE_KEY', enabled: true },
        ]);
      }
      if (u.includes('/rest/v1/router_models')) {
        return json([
          { id: 'm1', route_id: 'r1', model: 'test-model', enabled: true, capabilities: ['code_build'], cost_tier: 0, priority: 1 },
        ]);
      }
      if (u.includes('/rest/v1/router_health')) return json([]);
      if (u.includes('/rest/v1/axon_account_connectors')) return json([]);
      if (u.includes('/rest/v1/ni_platform_secrets')) return json([{ value: 'fake-api-key' }]);
      if (u.includes('/rest/v1/axon_router_decisions')) return json([{ id: 'dec-1' }]);
      if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
      if (u.includes('/functions/v1/slack-post')) {
        slackPosted = true;
        return { ok: true, status: 200 };
      }
      if (u.includes('/chat/completions') || u.includes('api.example.com')) {
        throw new Error('lane execution deliberately fails in this test');
      }
      throw new Error(`unmocked fetch in test 2: ${u}`);
    },
    async () => {
      await assert.rejects(
        () => routeChat('fake-key', { messages: [{ role: 'user', content: 'please review this diff and PR #12' }] }),
        /every lane failed/,
      );
    },
  );

  const ledgerCalls = calls.filter((c) => c.url.includes('/rest/v1/axon_cost_ledger'));
  const failureMarkerRows = ledgerCalls.filter((c) => c.body?.provider === 'none');
  assert.equal(failureMarkerRows.length, 1, 'exactly one failure-marker usage row for the total fallthrough');
  const marker = failureMarkerRows[0].body;
  assert.equal(marker.cost_usd, 0);
  assert.equal(marker.input_tokens, 0);
  assert.equal(marker.output_tokens, 0);
  const notes = JSON.parse(marker.notes);
  assert.equal(notes.status, 'total_fallthrough');

  assert.ok(
    lines.some((l) => l.includes('route_chat_total_fallthrough')),
    'one structured log line for the total fallthrough',
  );
  assert.ok(slackPosted, 'best-effort #agent-ops Slack post fires on total fallthrough');
});

console.log('axon-router-total-fallthrough.test.mjs: all assertions passed');
