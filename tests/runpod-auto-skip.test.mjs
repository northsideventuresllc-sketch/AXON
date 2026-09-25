#!/usr/bin/env node
/**
 * AX-RUNPOD-AUTO-SKIP-0924 (NI-Brain Decision #2001, 2026-09-24) — proves the RunPod
 * circuit breaker in lib/axon-router-core.mjs:
 *   1. Default: RunPod is skipped (disabled by default, no AXON_ENABLE_RUNPOD set) and
 *      the chain falls straight through to the next tier, without ever resolving RunPod's
 *      route/model.
 *   2. AXON_ENABLE_RUNPOD=1 re-includes RunPod in the walk (it gets attempted).
 *   3. The breaker trips after 3 RunPod failures within the window and then auto-skips,
 *      even with AXON_ENABLE_RUNPOD=1 set.
 *   4. AXON_SKIP_RUNPOD=1 force-skips regardless of AXON_ENABLE_RUNPOD.
 *   5. DEFAULT_LLM_CHAIN itself is untouched — 'runpod' stays in its locked position
 *      (tests/runpod-tier.test.mjs already proves this; re-asserted here as a guard that
 *      this change stayed additive).
 *
 * Run: node tests/runpod-auto-skip.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate, DEFAULT_LLM_CHAIN, __runpodBreakerTestHooks } from '../lib/axon-router-core.mjs';
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
  runpod: { id: 'route-runpod', name: 'runpod-axon-v1', base_url: null, secret_key: 'RUNPOD_AXON_V1_KEY', enabled: true },
  openrouter: { id: 'route-openrouter', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true },
};
const MODEL = {
  runpod: { id: 'model-runpod', model: 'axon-v1', enabled: true, cost_tier: 0, priority: 1 },
  openrouter: { id: 'model-openrouter', model: 'deepseek/deepseek-v4-flash', enabled: true, cost_tier: 0, priority: 1 },
};

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

function makeFetch({ chainRows, secrets = {}, accountKeys = {}, providerHandlers = {}, calls }) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? safeParse(opts.body) : null });

    if (u.includes('/rest/v1/axon_llm_chain')) return json(chainRows);
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
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('/rest/v1/router_health')) return json([]);
    if (u.includes('chat/completions')) {
      const h = providerHandlers.openrouter;
      if (h) return h(u, opts);
      throw new Error(`unhandled provider call: ${u}`);
    }
    if (u.includes('runpod-fake-endpoint')) {
      const h = providerHandlers.runpod;
      if (h) return h(u, opts);
      throw new Error(`unhandled runpod call: ${u}`);
    }
    if (u.includes('nvg_mini_jobs') || u.includes('mini-queue')) return json([]);
    throw new Error(`unmocked fetch: ${u}`);
  };
}

const okChat = (text) => async () => json({ choices: [{ message: { content: text } }] });
const msgs = [{ role: 'user', content: 'hi' }];

// RunPod handler helpers: submitRes must be a COMPLETED/FAILED job on the first /run call
// (no polling needed), and any /cancel/... call (fire-and-forget) is a harmless 200.
const runpodOk = (text) => async (u) => {
  if (u.includes('/cancel/')) return json({});
  return json({ id: 'job-1', status: 'COMPLETED', output: text });
};
const runpodFail = async (u) => {
  if (u.includes('/cancel/')) return json({});
  return json({ id: 'job-1', status: 'FAILED', error: 'simulated failure' });
};

const CHAIN = [
  { tier: 'runpod', position: 0, enabled: true },
  { tier: 'openrouter', position: 1, enabled: true },
];
const SECRETS = {
  RUNPOD_AXON_V1_KEY: 'runpod-key',
  RUNPOD_AXON_V1_ENDPOINT: 'https://runpod-fake-endpoint.example/v2',
  OPENROUTER_API_KEY: 'or-key',
};

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

// --- 1. default: RunPod disabled by default, chain falls through without resolving it ---
await withEnv({ AXON_ENABLE_RUNPOD: undefined, AXON_SKIP_RUNPOD: undefined }, async () => {
  __runpodBreakerTestHooks.resetRunpodBreaker();
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: CHAIN,
      secrets: SECRETS,
      providerHandlers: {
        openrouter: okChat('hello from openrouter, runpod skipped by default'),
        runpod: async () => {
          throw new Error('RunPod must never be called when disabled by default');
        },
      },
      calls,
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'openrouter');
      assert.equal(out.text, 'hello from openrouter, runpod skipped by default');
    },
  );
  assert.ok(
    !calls.some((c) => c.url.includes('name=eq.runpod-axon-v1')),
    'RunPod route must never be resolved when the tier is skipped by default',
  );
});

// --- 2. AXON_ENABLE_RUNPOD=1 re-includes RunPod — it gets attempted ---------------------
await withEnv({ AXON_ENABLE_RUNPOD: '1', AXON_SKIP_RUNPOD: undefined }, async () => {
  __runpodBreakerTestHooks.resetRunpodBreaker();
  let runpodCalled = false;
  await withFetch(
    makeFetch({
      chainRows: CHAIN,
      secrets: SECRETS,
      providerHandlers: {
        runpod: async (u) => {
          runpodCalled = true;
          return runpodOk('hello from runpod')(u);
        },
      },
      calls: [],
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'runpod');
      assert.equal(out.text, 'hello from runpod');
    },
  );
  assert.equal(runpodCalled, true, 'AXON_ENABLE_RUNPOD=1 must re-include RunPod in the walk');
});

// --- 3. breaker trips after 3 failures within the window, even with the flag set --------
await withEnv({ AXON_ENABLE_RUNPOD: '1', AXON_SKIP_RUNPOD: undefined }, async () => {
  __runpodBreakerTestHooks.resetRunpodBreaker();
  let runpodAttempts = 0;

  for (let i = 0; i < 3; i++) {
    await withFetch(
      makeFetch({
        chainRows: CHAIN,
        secrets: SECRETS,
        providerHandlers: {
          runpod: async (u) => {
            if (!u.includes('/cancel/')) runpodAttempts++;
            return runpodFail(u);
          },
          openrouter: okChat('fallback after runpod fails'),
        },
        calls: [],
      }),
      async () => {
        const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
        assert.equal(out.provider, 'openrouter');
      },
    );
  }
  assert.equal(runpodAttempts, 3, 'RunPod must be attempted (and fail) 3 times before the breaker trips');
  assert.equal(__runpodBreakerTestHooks.runpodBreakerTripped(), true, 'breaker must be tripped after 3 failures');

  // 4th call: breaker should now auto-skip RunPod even though the flag is still set.
  await withFetch(
    makeFetch({
      chainRows: CHAIN,
      secrets: SECRETS,
      providerHandlers: {
        runpod: async () => {
          throw new Error('RunPod must not be attempted once the breaker has tripped');
        },
        openrouter: okChat('fallback, breaker tripped'),
      },
      calls: [],
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'openrouter');
    },
  );
  assert.equal(runpodAttempts, 3, 'RunPod attempt count must not increase once the breaker is tripped');
});

// --- 4. AXON_SKIP_RUNPOD=1 force-skips regardless of AXON_ENABLE_RUNPOD -----------------
await withEnv({ AXON_ENABLE_RUNPOD: '1', AXON_SKIP_RUNPOD: '1' }, async () => {
  __runpodBreakerTestHooks.resetRunpodBreaker();
  await withFetch(
    makeFetch({
      chainRows: CHAIN,
      secrets: SECRETS,
      providerHandlers: {
        runpod: async () => {
          throw new Error('AXON_SKIP_RUNPOD=1 must force-skip RunPod even when enabled');
        },
        openrouter: okChat('fallback, force-skip'),
      },
      calls: [],
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
      assert.equal(out.provider, 'openrouter');
    },
  );
});

// --- 5. DEFAULT_LLM_CHAIN stayed untouched — additive change only -----------------------
assert.deepEqual(
  DEFAULT_LLM_CHAIN,
  ['local', 'runpod', 'openrouter', 'gemini', 'anthropic'],
  'the locked chain order (Decision #1721) must be unchanged by the RunPod breaker',
);

__runpodBreakerTestHooks.resetRunpodBreaker();
console.log('runpod-auto-skip.test.mjs OK');
