#!/usr/bin/env node
/**
 * axonGenerate — the ONE locked default LLM chain (Decision #1721, Phase 3 lane C1).
 * Proves: locked order is honored, a disabled tier is skipped entirely, an account's own
 * key beats the platform key, a failed tier falls through to the next, and every attempt —
 * success or failure — is logged via recordLlmUsage.
 *
 * Run: node tests/axon-generate-chain.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate } from '../lib/axon-router-core.mjs';
import { encryptProviderKey } from '../lib/axon-account-keys.mjs';

process.env.AXON_KEYSTORE_SECRET = process.env.AXON_KEYSTORE_SECRET || 'test-only-secret-do-not-use-in-prod';

const originalFetch = globalThis.fetch;
function withFetch(handler, fn) {
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

const ROUTE = {
  local: { id: 'route-local', name: 'ollama-local', base_url: 'http://localhost:11434', secret_key: null, enabled: true },
  runpod: { id: 'route-runpod', name: 'runpod-axon-v1', base_url: null, secret_key: 'RUNPOD_AXON_V1_KEY', enabled: true },
  openrouter: { id: 'route-openrouter', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true },
  gemini: { id: 'route-gemini', name: 'gemini-api', base_url: null, secret_key: 'GEMINI_API_KEY', enabled: true },
  anthropic: { id: 'route-anthropic', name: 'anthropic-api', base_url: null, secret_key: 'ANTHROPIC_API_KEY', enabled: true },
};
const MODEL = {
  local: { id: 'model-local', model: 'axon-ornith', enabled: true, cost_tier: 0, priority: 1 },
  runpod: { id: 'model-runpod', model: 'axon-v1', enabled: true, cost_tier: 0, priority: 1 },
  openrouter: { id: 'model-openrouter', model: 'deepseek/deepseek-v4-flash', enabled: true, cost_tier: 0, priority: 1 },
  gemini: { id: 'model-gemini', model: 'gemini-2.5-flash', enabled: true, cost_tier: 0, priority: 1 },
  anthropic: { id: 'model-anthropic', model: 'claude-sonnet-5', enabled: true, cost_tier: 3, priority: 1 },
};

/**
 * Builds a fetch mock. `chainRows` seeds axon_llm_chain; `secrets` seeds ni_platform_secrets;
 * `accountKeys` seeds axon_account_provider_keys (plaintext in, encrypted before serving);
 * `providerHandlers` intercepts the actual model-call URLs (openrouter/gemini/anthropic
 * chat endpoints, and the mini relay's queueMiniShellJob path via nvg_mini_jobs).
 */
function makeFetch({ chainRows, secrets = {}, accountKeys = {}, providerHandlers = {}, calls }) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? safeParse(opts.body) : null });

    if (u.includes('/rest/v1/axon_llm_chain')) {
      return json(chainRows);
    }
    if (u.includes('/rest/v1/router_routes')) {
      const name = new URL(u).searchParams.get('name')?.replace('eq.', '');
      const route = Object.values(ROUTE).find((r) => r.name === name);
      return json(route ? [route] : []);
    }
    if (u.includes('/rest/v1/router_models')) {
      const routeId = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
      const tier = Object.keys(ROUTE).find((t) => ROUTE[t].id === routeId);
      return json(tier ? [MODEL[tier]] : []);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) {
      const provider = new URL(u).searchParams.get('provider')?.replace('eq.', '');
      const plain = accountKeys[provider];
      if (!plain) return json([]);
      return json([{ key_ciphertext: encryptProviderKey(plain), last4: plain.slice(-4) }]);
    }
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      return json(secrets[key] ? [{ value: secrets[key] }] : []);
    }
    if (u.includes('/rest/v1/axon_cost_ledger')) {
      return { ok: true, status: 200 };
    }
    if (u.includes('/rest/v1/router_health')) {
      return json([]);
    }
    if (u.includes('nvg_mini_jobs') || u.includes('mini-queue')) {
      const h = providerHandlers.local;
      if (h) return h(u, opts);
      return json([]);
    }
    if (u.includes('chat/completions')) {
      const provider = u.includes('openrouter') ? 'openrouter' : 'runpod';
      const h = providerHandlers[provider];
      if (h) return h(u, opts);
      throw new Error(`unhandled provider call: ${u}`);
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      const h = providerHandlers.gemini;
      if (h) return h(u, opts);
      throw new Error(`unhandled gemini call: ${u}`);
    }
    if (u.includes('api.anthropic.com')) {
      const h = providerHandlers.anthropic;
      if (h) return h(u, opts);
      throw new Error(`unhandled anthropic call: ${u}`);
    }
    throw new Error(`unmocked fetch: ${u}`);
  };
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
function json(data) {
  return { ok: true, status: 200, json: async () => data };
}
const okChat = (text) => async () => json({ choices: [{ message: { content: text } }] });
const okAnthropic = (text) => async () => json({ content: [{ text }] });
const okGemini = (text) => async () => json({ candidates: [{ content: { parts: [{ text }] } }] });

const msgs = [{ role: 'user', content: 'hi' }];

// --- 1. locked order is honored: openrouter (position 0) wins over anthropic (position 1) ---
await withFetch(
  makeFetch({
    chainRows: [
      { tier: 'openrouter', position: 0, enabled: true },
      { tier: 'anthropic', position: 1, enabled: true },
    ],
    secrets: { OPENROUTER_API_KEY: 'or-platform-key', ANTHROPIC_API_KEY: 'anthropic-platform-key' },
    providerHandlers: {
      openrouter: okChat('hello from openrouter'),
      anthropic: async () => {
        throw new Error('anthropic must not be called — openrouter is ahead of it and healthy');
      },
    },
    calls: [],
  }),
  async () => {
    const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
    assert.equal(out.provider, 'openrouter');
    assert.equal(out.text, 'hello from openrouter');
    assert.equal(out.usage.attempts, 1);
  },
);

// --- 2. a disabled tier is skipped entirely — never even resolved -----------------------
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [
        { tier: 'local', position: 0, enabled: false },
        { tier: 'openrouter', position: 1, enabled: true },
      ],
      secrets: { OPENROUTER_API_KEY: 'or-platform-key' },
      providerHandlers: { openrouter: okChat('hello from openrouter, local skipped') },
      calls,
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'openrouter');
    },
  );
  assert.ok(
    !calls.some((c) => c.url.includes('name=eq.ollama-local')),
    'a disabled tier must never be resolved against router_routes at all',
  );
}

// --- 3. an account's own key beats the platform key, and the platform key is never fetched ---
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [{ tier: 'openrouter', position: 0, enabled: true }],
      secrets: { OPENROUTER_API_KEY: 'or-platform-key' },
      accountKeys: { openrouter: 'or-my-own-key-9999' },
      providerHandlers: {
        openrouter: async (url, opts) => {
          const auth = opts.headers?.Authorization || '';
          assert.equal(auth, 'Bearer or-my-own-key-9999', 'must use the account key, not the platform key');
          return json({ choices: [{ message: { content: 'hi' } }] });
        },
      },
      calls,
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'openrouter');
    },
  );
  assert.ok(
    !calls.some((c) => c.url.includes('/ni_platform_secrets') && c.url.includes('key=eq.OPENROUTER_API_KEY')),
    'the platform key must never be fetched once the account key resolved',
  );
}

// --- 4. a failed tier falls through to the next tier -------------------------------------
await withFetch(
  makeFetch({
    chainRows: [
      { tier: 'openrouter', position: 0, enabled: true },
      { tier: 'gemini', position: 1, enabled: true },
    ],
    secrets: { OPENROUTER_API_KEY: 'or-platform-key', GEMINI_API_KEY: 'gemini-platform-key' },
    providerHandlers: {
      openrouter: async () => ({ ok: false, status: 500 }),
      gemini: okGemini('hello from gemini, openrouter fell through'),
    },
    calls: [],
  }),
  async () => {
    const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
    assert.equal(out.provider, 'gemini');
    assert.equal(out.usage.attempts, 2);
  },
);

// --- 5. every attempt is logged via recordLlmUsage (axon_cost_ledger), success + failure ---
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [
        { tier: 'openrouter', position: 0, enabled: true },
        { tier: 'anthropic', position: 1, enabled: true },
      ],
      secrets: { OPENROUTER_API_KEY: 'or-platform-key', ANTHROPIC_API_KEY: 'anthropic-platform-key' },
      providerHandlers: {
        openrouter: async () => ({ ok: false, status: 429 }),
        anthropic: okAnthropic('hello from claude, last resort'),
      },
      calls,
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, agentName: 'test-agent' });
      assert.equal(out.provider, 'anthropic');
    },
  );
  const ledgerCalls = calls.filter((c) => c.url.includes('/rest/v1/axon_cost_ledger'));
  assert.equal(ledgerCalls.length, 2, 'one usage row per tier attempted (failed openrouter + succeeded anthropic)');
  assert.equal(ledgerCalls[0].body.provider, 'openrouter');
  assert.equal(ledgerCalls[0].body.agent_name, 'test-agent');
  assert.ok(JSON.parse(ledgerCalls[0].body.notes).status === 'failed');
  assert.equal(ledgerCalls[1].body.provider, 'anthropic');
  assert.ok(JSON.parse(ledgerCalls[1].body.notes).status === 'ok');
}

// --- 6. no chain rows at all falls back to the locked default order (all 5 tiers) --------
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [],
      secrets: { OPENROUTER_API_KEY: 'or-platform-key' },
      providerHandlers: {
        local: async () => {
          throw new Error('local tier unreachable in this test');
        },
        openrouter: okChat('default-order openrouter'),
      },
      calls,
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: null, messages: msgs });
      // local (position 0) fails/unresolved, runpod unresolved (no base url), openrouter (position 2) wins.
      assert.equal(out.provider, 'openrouter');
    },
  );
}

console.log('axon-generate-chain.test.mjs: all assertions passed');
