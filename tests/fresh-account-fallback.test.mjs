#!/usr/bin/env node
/**
 * Step 4 verification — a truly fresh account (zero axon_llm_chain rows AND zero
 * axon_account_connectors rows, e.g. right after signup, before ever touching Settings)
 * must still get a working reply instead of routing to nothing.
 *
 * This was flagged as "believed already correct" going into this change (loadLlmChain()
 * falls PLATFORM_ACCOUNT_ID -> DEFAULT_LLM_CHAIN; listCandidateLanes() falls open to the
 * whole global catalog when an account has zero connector rows) — this file actually proves
 * it against the real functions instead of trusting the belief, per the "verify, don't
 * assume" instruction. Nothing here changed as part of this PR; it is a proof, not a fix.
 *
 * Run: node tests/fresh-account-fallback.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate, listCandidateLanes } from '../lib/axon-router-core.mjs';

process.env.AXON_KEYSTORE_SECRET = process.env.AXON_KEYSTORE_SECRET || 'test-only-secret-do-not-use-in-prod';

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

const FRESH_ACCOUNT_ID = 'acct-brand-new-zero-rows';

// --- 1. axonGenerate: zero axon_llm_chain rows for this account AND the platform account
//     (worst case — even the platform seed migration hasn't run) -> DEFAULT_LLM_CHAIN order
//     still resolves and answers via whichever tier is actually configured. -----------------
{
  const ROUTE = {
    id: 'route-openrouter',
    name: 'openrouter',
    base_url: 'https://openrouter.example.test/v1',
    secret_key: 'FRESH_ACCOUNT_TEST_OR_KEY',
    enabled: true,
  };
  const MODEL = { id: 'model-openrouter', model: 'free-model', enabled: true, cost_tier: 0, priority: 1 };
  process.env.FRESH_ACCOUNT_TEST_OR_KEY = 'platform-key-for-fresh-account-test';

  const fetchMock = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/axon_llm_chain')) return json([]); // zero rows, account AND platform
    if (u.includes('/rest/v1/router_routes')) {
      const name = new URL(u).searchParams.get('name')?.replace('eq.', '');
      return json(name === 'openrouter' ? [ROUTE] : []);
    }
    if (u.includes('/rest/v1/router_models')) {
      const routeId = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
      return json(routeId === ROUTE.id ? [MODEL] : []);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]); // no account keys either
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('nvg_mini_jobs')) return json([]);
    if (u.includes('openrouter.example.test')) {
      return json({ choices: [{ message: { content: 'hello, fresh account' } }] });
    }
    throw new Error(`unmocked fetch: ${u}`);
  };

  await withFetch(fetchMock, async () => {
    const out = await axonGenerate('fake-supabase-key', {
      accountId: FRESH_ACCOUNT_ID,
      messages: [{ role: 'user', content: 'hi' }],
    });
    // local (unconfigured) and runpod (no endpoint) fall through silently; openrouter — the
    // 3rd tier in DEFAULT_LLM_CHAIN — is the first one actually configured, and answers.
    assert.equal(out.provider, 'openrouter');
    assert.equal(out.text, 'hello, fresh account');
  });
}

// --- 2. listCandidateLanes: zero axon_account_connectors rows for this account -> falls
//     open to the whole global router_routes/router_models catalog instead of returning
//     zero candidates (which would make routeChat throw "no lanes available"). --------------
{
  const ROUTE = { id: 'route-1', name: 'gemini-api', enabled: true, connector_kind: 'api' };
  const MODEL = { id: 'model-1', route_id: 'route-1', model: 'gemini-2.5-flash', enabled: true, capabilities: ['vision'], cost_tier: 0 };

  const fetchMock = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/router_routes')) return json([ROUTE]);
    if (u.includes('/rest/v1/router_models')) return json([MODEL]);
    if (u.includes('/rest/v1/router_health')) return json([]);
    if (u.includes('/rest/v1/axon_account_connectors')) return json([]); // zero rows
    throw new Error(`unmocked fetch: ${u}`);
  };

  await withFetch(fetchMock, async () => {
    const lanes = await listCandidateLanes('fake-supabase-key', { accountId: FRESH_ACCOUNT_ID });
    assert.equal(lanes.length, 1, 'a fresh account with zero connector rows must still see the global catalog');
    assert.equal(lanes[0].laneId, 'model-1');
  });
}

console.log('fresh-account-fallback.test.mjs: all assertions passed');
