#!/usr/bin/env node
/**
 * AXON-TELEGRAM-LATENCY-0925 — hard per-tier timeouts for the interactive (Telegram) path.
 * Proves:
 *   1. resolveInteractiveTierTimeoutMs is a no-op (null) for every tier unless a caller
 *      explicitly opts in via `interactive: true` or a `tierTimeoutsMs` override — every
 *      existing (non-interactive) caller of axonGenerate/generateViaRouter is unaffected.
 *   2. `interactive: true` applies the default local=6s / free-API=12s timeouts, and leaves
 *      anthropic/runpod untouched (paid last resort, and its own separate breaker).
 *   3. A tier that hangs past its timeout is abandoned (via AbortController) and the chain
 *      falls through to the next tier IMMEDIATELY — not after the slow tier's own delay —
 *      while tier order and the free-first/paid-last-resort rule stay exactly as-is.
 *
 * Run: node tests/axon-generate-interactive-timeout.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate, resolveInteractiveTierTimeoutMs } from '../lib/axon-router-core.mjs';

// --- 1. pure resolver: no timeout anywhere unless opted in -------------------------------
{
  for (const tier of ['local', 'openrouter', 'gemini', 'anthropic', 'runpod']) {
    assert.equal(
      resolveInteractiveTierTimeoutMs(tier, {}),
      null,
      `${tier}: no interactive flag, no override -> must stay unbounded (unchanged behavior)`,
    );
    assert.equal(
      resolveInteractiveTierTimeoutMs(tier, { interactive: false }),
      null,
      `${tier}: interactive explicitly false -> must stay unbounded`,
    );
  }
}

// --- 2. interactive defaults: local 6s, free API tiers 12s, anthropic/runpod untouched ---
{
  assert.equal(resolveInteractiveTierTimeoutMs('local', { interactive: true }), 6_000);
  assert.equal(resolveInteractiveTierTimeoutMs('openrouter', { interactive: true }), 12_000);
  assert.equal(resolveInteractiveTierTimeoutMs('gemini', { interactive: true }), 12_000);
  assert.equal(
    resolveInteractiveTierTimeoutMs('anthropic', { interactive: true }),
    null,
    'anthropic is the paid last resort — never given a hard interactive ceiling',
  );
  assert.equal(
    resolveInteractiveTierTimeoutMs('runpod', { interactive: true }),
    null,
    'runpod already carries its own 25s job-queue timeout and stays off by default',
  );
}

// --- 3. an explicit tierTimeoutsMs override always wins, interactive or not --------------
{
  assert.equal(resolveInteractiveTierTimeoutMs('local', { tierTimeoutsMs: { local: 3_000 } }), 3_000);
  assert.equal(
    resolveInteractiveTierTimeoutMs('local', { interactive: true, tierTimeoutsMs: { local: null } }),
    null,
    'an explicit null override turns the default off even when interactive is true',
  );
}

// --- 4. integration: a hung tier is abandoned and the chain falls through immediately ----
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

const ROUTE = {
  openrouter: { id: 'route-openrouter', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true },
  gemini: { id: 'route-gemini', name: 'gemini-api', base_url: null, secret_key: 'GEMINI_API_KEY', enabled: true },
};
const MODEL = {
  openrouter: { id: 'model-openrouter', model: 'deepseek/deepseek-v4-flash', enabled: true, cost_tier: 0, priority: 1 },
  gemini: { id: 'model-gemini', model: 'gemini-2.5-flash', enabled: true, cost_tier: 0, priority: 1 },
};

function makeFetch() {
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/axon_llm_chain')) {
      return json([
        { tier: 'openrouter', position: 0, enabled: true },
        { tier: 'gemini', position: 1, enabled: true },
      ]);
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
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      const secrets = { OPENROUTER_API_KEY: 'or-key', GEMINI_API_KEY: 'gemini-key' };
      return json(secrets[key] ? [{ value: secrets[key] }] : []);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('/rest/v1/router_health')) return json([]);
    if (u.includes('/rest/v1/nvg_mini_jobs')) return { ok: true, status: 200 };
    if (u.includes('chat/completions')) {
      // openrouter: never resolves on its own — only settles when its AbortSignal fires,
      // exactly the "hard timeout via AbortController" this ticket asks for. If the chain
      // ever actually waited this out, the test's own timeout would catch it.
      return new Promise((resolve, reject) => {
        const hangTimer = setTimeout(() => resolve(json({ choices: [{ message: { content: 'too late' } }] })), 5_000);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(hangTimer);
          reject(new Error('openrouter call aborted'));
        });
      });
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      return json({ candidates: [{ content: { parts: [{ text: 'hello from gemini, openrouter timed out' } ] } }] });
    }
    throw new Error(`unmocked fetch: ${u}`);
  };
}

const msgs = [{ role: 'user', content: 'hi' }];

await withFetch(makeFetch(), async () => {
  const start = Date.now();
  const out = await axonGenerate('fake-key', {
    accountId: 'acct-1',
    messages: msgs,
    interactive: true,
    tierTimeoutsMs: { openrouter: 80 }, // fast for the test; proves the mechanism, not the exact default
  });
  const elapsed = Date.now() - start;

  assert.equal(out.provider, 'gemini', 'gemini must answer once openrouter times out — order unchanged');
  assert.equal(out.text, 'hello from gemini, openrouter timed out');
  assert.ok(
    elapsed < 2_000,
    `must fall through immediately on timeout, not wait for the hung tier's own 5s delay (took ${elapsed}ms)`,
  );
  assert.ok(
    out.usage.tierTimings.some((t) => t.tier === 'openrouter' && t.status === 'timeout'),
    'the timed-out tier must be recorded as such in usage.tierTimings',
  );
  assert.ok(
    out.usage.tierTimings.some((t) => t.tier === 'gemini' && t.status === 'ok'),
    'the tier that answered must also be recorded in usage.tierTimings',
  );
});

// --- 5. same chain, interactive NOT set — the hung tier is waited out (no behavior change
// for non-interactive callers). Uses a short artificial hang (150ms) so the test stays fast
// while still proving no timeout fires without opting in. ---------------------------------
await withFetch(
  (() => {
    const inner = makeFetch();
    return async (url, opts = {}) => {
      const u = String(url);
      if (u.includes('chat/completions')) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(json({ choices: [{ message: { content: 'slow but real' } }] })), 150);
        });
      }
      return inner(url, opts);
    };
  })(),
  async () => {
    const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs });
    assert.equal(out.provider, 'openrouter', 'non-interactive call must still wait out a slow (but real) tier');
    assert.equal(out.text, 'slow but real');
  },
);

console.log('axon-generate-interactive-timeout.test.mjs: all assertions passed');
