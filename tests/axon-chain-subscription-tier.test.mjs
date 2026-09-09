#!/usr/bin/env node
/**
 * axon-chain-subscription-tier.test.mjs — AX-CHAIN-SUBSCRIPTION-TIERS-0909.
 *
 * Proves subscription-kind tiers (claude_subscription / chatgpt_subscription /
 * gemini_subscription) are real, additive, opt-in lanes in the ONE locked chain
 * (axonGenerate), never a replacement for the API-key lanes:
 *   1. A subscription tier in an account's axon_llm_chain actually runs via the mini relay
 *      when hasMini is true, building its command from route.cli_command generically (no
 *      hardcoded per-tier branch) — proven with claude_subscription and, separately, with
 *      gemini_subscription (cli_command 'antigravity') to show the SAME code path handles
 *      both.
 *   2. hasMini=false — and hasMini simply never passed — is an honest capability boundary:
 *      the tier fails cleanly with no network call at all and the chain falls through to
 *      the next tier, exactly like any other unconfigured tier. Never a silent no-op.
 *   3. DEFAULT_LLM_CHAIN (Decision #1721, the platform-wide locked default) is untouched —
 *      no subscription tier is in it.
 *   4. The mini's risk gate (lib/nvg-mini-risk-gate.mjs) allowlists the real commands these
 *      lanes build, including the Antigravity CLI's `agy -p ...` — and no longer allowlists
 *      the retired `gemini -p ...` shape.
 *
 * Run: node tests/axon-chain-subscription-tier.test.mjs
 */
import assert from 'node:assert/strict';
import { axonGenerate, DEFAULT_LLM_CHAIN } from '../lib/axon-router-core.mjs';
import { classifyMiniShellRisk } from '../lib/nvg-mini-risk-gate.mjs';

const originalFetch = globalThis.fetch;
function withFetch(handler, fn) {
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// The subscription-success cases go through queueMiniShellJob's real poll loop
// (MINI_POLL_MS between polls). Fast-forward setTimeout for the duration of those cases
// only, so this file stays fast without touching nvg-mini-queue.mjs's real timing contract.
const realSetTimeout = globalThis.setTimeout;
function withFastTimers(fn) {
  globalThis.setTimeout = (cb, _ms, ...args) => realSetTimeout(cb, 0, ...args);
  return fn().finally(() => {
    globalThis.setTimeout = realSetTimeout;
  });
}

function json(data) {
  return { ok: true, status: 200, json: async () => data };
}

const ROUTE = {
  claude_subscription: {
    id: 'r-claude-sub',
    name: 'claude-subscription',
    connector_kind: 'subscription',
    cli_command: 'claude',
    enabled: true,
  },
  gemini_subscription: {
    id: 'r-gemini-sub',
    name: 'gemini-subscription',
    connector_kind: 'subscription',
    cli_command: 'antigravity',
    enabled: true,
  },
  openrouter: {
    id: 'r-or',
    name: 'openrouter',
    connector_kind: 'api',
    base_url: 'https://openrouter.ai/api/v1',
    secret_key: 'OPENROUTER_API_KEY',
    enabled: true,
  },
};
const MODEL = {
  claude_subscription: { id: 'm-claude-sub', model: 'claude-sonnet-5', enabled: true, cost_tier: 0, priority: 10 },
  gemini_subscription: { id: 'm-gemini-sub', model: 'gemini-pro-latest', enabled: true, cost_tier: 0, priority: 30 },
  openrouter: { id: 'm-or', model: 'deepseek/deepseek-v4-flash', enabled: true, cost_tier: 0, priority: 1 },
};

function makeFetch({ chainRows, miniJobResult, calls, openrouterHandler, secrets = {} }) {
  return async (url, opts = {}) => {
    const u = String(url);
    let body = null;
    try {
      body = opts.body ? JSON.parse(opts.body) : null;
    } catch {
      body = opts.body;
    }
    calls.push({ url: u, method: opts.method || 'GET', body });

    if (u.includes('/rest/v1/axon_llm_chain')) return json(chainRows);
    if (u.includes('/rest/v1/router_routes')) {
      const name = new URL(u).searchParams.get('name')?.replace('eq.', '');
      const route = Object.values(ROUTE).find((r) => r.name === name);
      return json(route ? [route] : []);
    }
    if (u.includes('/rest/v1/router_models')) {
      const routeId = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
      const tier = Object.keys(ROUTE).find((t) => ROUTE[t].id === routeId);
      return json(tier && MODEL[tier] ? [MODEL[tier]] : []);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      return json(secrets[key] ? [{ value: secrets[key] }] : []);
    }
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('/rest/v1/router_health')) return json([]);
    if (u.includes('/rest/v1/nvg_mini_jobs')) {
      if ((opts.method || 'GET') === 'POST') return json([{ id: 'job-1' }]);
      return json([{ status: 'done', result: { stdout: miniJobResult } }]); // poll
    }
    if (u.includes('chat/completions')) {
      if (openrouterHandler) return openrouterHandler(u, opts);
      throw new Error(`unhandled provider call: ${u}`);
    }
    throw new Error(`unmocked fetch: ${u}`);
  };
}

const msgs = [{ role: 'user', content: 'hi' }];

// --- 1. hasMini=true: claude_subscription actually runs via the mini, command built from
//        route.cli_command (not a hardcoded tier-name branch) ----------------------------
{
  const calls = [];
  await withFastTimers(() =>
    withFetch(
      makeFetch({
        chainRows: [{ tier: 'claude_subscription', position: 0, enabled: true }],
        miniJobResult: JSON.stringify({ result: 'hello from claude subscription' }),
        calls,
      }),
      async () => {
        const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, hasMini: true });
        assert.equal(out.provider, 'claude_subscription');
        assert.equal(out.text, 'hello from claude subscription');
      },
    ),
  );
  const insertPost = calls.find((c) => c.url.includes('/rest/v1/nvg_mini_jobs') && c.method === 'POST');
  assert.ok(insertPost, 'must queue a mini shell job for the subscription CLI');
  assert.ok(
    insertPost.body.payload.cmd.startsWith(`claude -p '`),
    `cmd must come from route.cli_command ('claude'), got: ${insertPost.body.payload.cmd}`,
  );
  assert.equal(insertPost.body.risk_flag, 'low', 'the built claude command must be allowlisted');
}

// --- 2. hasMini=false: an honest capability boundary — falls through to the next tier,
//        with ZERO network call for the subscription tier at all --------------------------
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [
        { tier: 'claude_subscription', position: 0, enabled: true },
        { tier: 'openrouter', position: 1, enabled: true },
      ],
      miniJobResult: JSON.stringify({ result: 'must never be reached' }),
      calls,
      secrets: { OPENROUTER_API_KEY: 'or-test-key' },
      openrouterHandler: async () =>
        json({ choices: [{ message: { content: 'hello from openrouter, subscription had no mini' } }] }),
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, hasMini: false });
      assert.equal(out.provider, 'openrouter');
      assert.equal(out.text, 'hello from openrouter, subscription had no mini');
    },
  );
  assert.ok(
    !calls.some((c) => c.url.includes('/rest/v1/nvg_mini_jobs')),
    'no mini job should ever be queued when hasMini is false — must short-circuit before any network call',
  );
}

// --- 3. hasMini simply omitted (the common case for any caller that hasn't been updated to
//        pass it) defaults to false — never silently spends a subscription lane -----------
{
  const calls = [];
  await withFetch(
    makeFetch({
      chainRows: [
        { tier: 'claude_subscription', position: 0, enabled: true },
        { tier: 'openrouter', position: 1, enabled: true },
      ],
      miniJobResult: JSON.stringify({ result: 'must never be reached' }),
      calls,
      secrets: { OPENROUTER_API_KEY: 'or-test-key' },
      openrouterHandler: async () => json({ choices: [{ message: { content: 'default-false fallthrough' } }] }),
    }),
    async () => {
      const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs }); // hasMini omitted
      assert.equal(out.provider, 'openrouter');
    },
  );
  assert.ok(!calls.some((c) => c.url.includes('/rest/v1/nvg_mini_jobs')));
}

// --- 4. Generic by connector_kind, not tier name: gemini_subscription (cli_command
//        'antigravity') resolves and runs through the SAME branch, no new code path -------
{
  const calls = [];
  await withFastTimers(() =>
    withFetch(
      makeFetch({
        chainRows: [{ tier: 'gemini_subscription', position: 0, enabled: true }],
        miniJobResult: JSON.stringify({ response: 'hello from antigravity' }),
        calls,
      }),
      async () => {
        const out = await axonGenerate('fake-key', { accountId: 'acct-1', messages: msgs, hasMini: true });
        assert.equal(out.provider, 'gemini_subscription');
        assert.equal(out.text, 'hello from antigravity');
      },
    ),
  );
  const insertPost = calls.find((c) => c.url.includes('/rest/v1/nvg_mini_jobs') && c.method === 'POST');
  assert.ok(insertPost, 'must queue a mini shell job for the antigravity CLI');
  assert.ok(
    insertPost.body.payload.cmd.startsWith(`agy -p '`),
    `cli_command 'antigravity' must build an 'agy -p' invocation (not the retired 'gemini -p'), got: ${insertPost.body.payload.cmd}`,
  );
  assert.equal(insertPost.body.risk_flag, 'low');
}

// --- 5. DEFAULT_LLM_CHAIN is untouched — subscription tiers are opt-in per account only,
//        never in the platform-wide locked order (Decision #1721) -------------------------
assert.deepEqual(DEFAULT_LLM_CHAIN, ['local', 'runpod', 'openrouter', 'gemini', 'anthropic']);
assert.ok(!DEFAULT_LLM_CHAIN.some((t) => t.includes('subscription')));

// --- 6. Mini risk gate: the real commands these three CLIs build are allowlisted low, and
//        the retired `gemini -p` shape is not ----------------------------------------------
assert.equal(classifyMiniShellRisk(`claude -p 'hi' --output-format json`).riskFlag, 'low');
assert.equal(classifyMiniShellRisk(`codex exec 'hi' --json`).riskFlag, 'low');
assert.equal(classifyMiniShellRisk(`agy -p 'hi' --output-format json --print-timeout 35s`).riskFlag, 'low');
assert.equal(classifyMiniShellRisk(`gemini -p 'hi'`).riskFlag, 'high', 'the retired gemini CLI shape must no longer be allowlisted');

console.log('axon-chain-subscription-tier.test.mjs: all assertions passed');
