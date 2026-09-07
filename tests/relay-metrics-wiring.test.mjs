/**
 * RELAY-95-HARDEN-0907: proves the fix for the 2026-09-05 -> 2026-09-07 relay measurement
 * gap. Root cause: axon-router-core.mjs's locked LLM chain (axonGenerate/executeChainTier)
 * became the real call path for the 'local' tier but never called logRelayMetric — it wrote
 * only to axon_cost_ledger via recordLlmUsage, a different table answering a different
 * question. This proves:
 *   1. A successful local-tier attempt writes a kind='relay_metric' row (tier=local, success=true).
 *   2. A failed local-tier attempt (after the retry) writes a kind='relay_metric' failure row.
 *   3. A fully exhausted chain writes a kind='relay_dead_letter' row and posts to #agent-ops
 *      (Part 2 hardening — this path had neither before).
 *   4. api-key tiers (gemini/anthropic/openrouter) do NOT write relay_metric rows — that
 *      table is scoped to the mini/RunPod relay transport, same as before this fix.
 *
 * Run: node tests/relay-metrics-wiring.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate } from '../lib/axon-router-core.mjs';

const originalFetch = globalThis.fetch;
function withFetch(handler, fn) {
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function json(data) {
  return { ok: true, status: 200, json: async () => data };
}

const ROUTE_LOCAL = { id: 'route-local', name: 'ollama-local', base_url: 'http://localhost:11434', secret_key: null, enabled: true };
const MODEL_LOCAL = { id: 'model-local', model: 'axon-ornith', enabled: true, cost_tier: 0, priority: 1 };
const ROUTE_GEMINI = { id: 'route-gemini', name: 'gemini-api', base_url: null, secret_key: 'GEMINI_API_KEY', enabled: true };
const MODEL_GEMINI = { id: 'model-gemini', model: 'gemini-2.5-flash', enabled: true, cost_tier: 0, priority: 1 };

const msgs = [{ role: 'user', content: 'hi' }];

/** Builds a mock that tracks every nvg_mini_jobs POST body and every slack-post call. */
function makeMock({ chainRows, localBehavior = 'succeed', geminiOk = true }) {
  const miniJobPosts = [];
  const slackPosts = [];
  let localJobId = 0;

  const handler = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';

    if (u.includes('/rest/v1/axon_llm_chain')) return json(chainRows);
    if (u.includes('/rest/v1/router_routes')) {
      const name = new URL(u).searchParams.get('name')?.replace('eq.', '');
      if (name === 'ollama-local') return json([ROUTE_LOCAL]);
      if (name === 'gemini-api') return json([ROUTE_GEMINI]);
      return json([]);
    }
    if (u.includes('/rest/v1/router_models')) {
      const routeId = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
      if (routeId === ROUTE_LOCAL.id) return json([MODEL_LOCAL]);
      if (routeId === ROUTE_GEMINI.id) return json([MODEL_GEMINI]);
      return json([]);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      return key === 'GEMINI_API_KEY' ? json([{ value: 'gemini-key' }]) : json([]);
    }
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };

    if (u.includes('/rest/v1/nvg_mini_jobs')) {
      if (method === 'POST') {
        const body = JSON.parse(opts.body);
        miniJobPosts.push(body);
        if (body.kind === 'shell') {
          if (localBehavior === 'insert_fails') return { ok: false, status: 500 };
          localJobId += 1;
          return json([{ id: `job-${localJobId}` }]);
        }
        // relay_metric / relay_dead_letter / relay_alarm inserts — just accept.
        return { ok: true, status: 201 };
      }
      // GET poll (for the queued shell job) or GET for checkRelayHealthAlarm's window query.
      if (u.includes('id=eq.job-')) {
        if (localBehavior === 'fail') return json([{ status: 'failed', result: null, error: 'mini error' }]);
        return json([{ status: 'done', result: { stdout: JSON.stringify({ response: 'hello from local' }) }, error: null }]);
      }
      // checkRelayHealthAlarm's rolling-window read — keep the sample under the 5-row floor
      // so the alarm never fires and this test stays scoped to the metric/dead-letter wiring.
      return json([]);
    }

    if (u.includes('generativelanguage.googleapis.com')) {
      if (!geminiOk) return { ok: false, status: 500 };
      return json({ candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] });
    }

    if (u.includes('/functions/v1/slack-post')) {
      slackPosts.push(JSON.parse(opts.body));
      return { ok: true, status: 200 };
    }

    throw new Error(`unmocked fetch: ${u}`);
  };

  return { handler, miniJobPosts: () => miniJobPosts, slackPosts: () => slackPosts };
}

// --- 1. successful local tier writes a relay_metric success row -------------------------
{
  const mock = makeMock({ chainRows: [{ tier: 'local', position: 0, enabled: true }] });
  await withFetch(mock.handler, async () => {
    const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
    assert.equal(out.provider, 'local');
    assert.equal(out.text, 'hello from local');
  });
  const metricRows = mock.miniJobPosts().filter((b) => b.kind === 'relay_metric');
  assert.equal(metricRows.length, 1, 'exactly one relay_metric row for the successful local attempt');
  assert.equal(metricRows[0].payload.tier, 'local');
  assert.equal(metricRows[0].payload.success, true);
  assert.equal(metricRows[0].status, 'done');
}

// --- 2. local tier fails (mini returns status=failed) -> relay_metric failure row --------
// falls through to gemini so the overall call still succeeds.
{
  const mock = makeMock({
    chainRows: [
      { tier: 'local', position: 0, enabled: true },
      { tier: 'gemini', position: 1, enabled: true },
    ],
    localBehavior: 'fail',
  });
  await withFetch(mock.handler, async () => {
    const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
    assert.equal(out.provider, 'gemini', 'local fails, chain falls through to gemini');
  });
  const metricRows = mock.miniJobPosts().filter((b) => b.kind === 'relay_metric');
  assert.equal(metricRows.length, 1, 'the local failure is still logged even though gemini answered');
  assert.equal(metricRows[0].payload.tier, 'local');
  assert.equal(metricRows[0].payload.success, false);
  assert.equal(metricRows[0].status, 'failed');
  const geminiMetricRows = mock.miniJobPosts().filter((b) => b.kind === 'relay_metric' && b.payload.tier === 'gemini');
  assert.equal(geminiMetricRows.length, 0, 'api-key tiers never write relay_metric rows');
}

// --- 3. chain fully exhausted -> dead-letter row + #agent-ops post -----------------------
{
  const mock = makeMock({
    chainRows: [{ tier: 'local', position: 0, enabled: true }],
    localBehavior: 'insert_fails',
  });
  await withFetch(mock.handler, async () => {
    await assert.rejects(() => axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, kind: 'cheap_chat' }));
  });
  const deadLetters = mock.miniJobPosts().filter((b) => b.kind === 'relay_dead_letter');
  assert.equal(deadLetters.length, 1, 'an exhausted chain writes exactly one dead-letter row');
  assert.equal(deadLetters[0].payload.kind, 'cheap_chat');
  assert.ok(Array.isArray(deadLetters[0].payload.attempts) && deadLetters[0].payload.attempts.length >= 1);
  assert.equal(mock.slackPosts().length, 1, 'an exhausted chain posts one #agent-ops alert');
  assert.match(mock.slackPosts()[0].text, /chain exhausted/i);

  // The local tier itself retries once before giving up, and each attempt is still a single
  // logical relay_metric failure row (not one per retry) — matches the pre-existing contract
  // that logRelayMetric fires once per axonGenerate tier attempt.
  const metricRows = mock.miniJobPosts().filter((b) => b.kind === 'relay_metric');
  assert.equal(metricRows.length, 1);
  assert.equal(metricRows[0].payload.success, false);
}

console.log('relay-metrics-wiring.test.mjs: all assertions passed');
