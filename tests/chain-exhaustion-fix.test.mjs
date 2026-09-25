#!/usr/bin/env node
/**
 * AG-VERIFY-CHAIN-EXHAUSTION-0924 — the live all-tiers-down incident (relay_dead_letter
 * 4222/4261, 2026-09-24). Proves:
 *   1. a retired GEMINI_MODEL override (gemini-2.0-flash, 404 live) is ignored and the tier
 *      uses router_models' live ids; a 404 on one model moves to the next;
 *   2. openrouter walks every free model, not just the first ("provider returned no content");
 *   3. a local job the NI-Brain trigger flips to blocked_needs_jb fails the tier at once —
 *      no 130s wait, no retry (so no second JB card);
 *   4. a repeat block with an open card in the last 24h does not open another card;
 *   5. the local curl body is single-quoted, so $(...) / backticks in a prompt are literal.
 *
 * Run: node tests/chain-exhaustion-fix.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  axonGenerate,
  buildTierModelCandidates,
  isRetiredGeminiModel,
  buildLocalGenerateCmd,
  shSingleQuote,
} from '../lib/axon-router-core.mjs';
import { queueMiniShellJobDetailed } from '../lib/nvg-mini-queue.mjs';
import { blockUnclassifiedMiniShellJob } from '../lib/nvg-mini-risk-gate.mjs';

const json = (v) => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
const originalFetch = globalThis.fetch;

// --- 1. pure candidate builder --------------------------------------------------------
{
  assert.equal(isRetiredGeminiModel('gemini-2.0-flash'), true);
  assert.equal(isRetiredGeminiModel('gemini-1.5-flash'), true);
  assert.equal(isRetiredGeminiModel('gemini-2.5-flash'), false);
  assert.equal(isRetiredGeminiModel('gemini-flash-lite-latest'), false);

  const gm = [
    { model: 'gemini-flash-lite-latest', cost_tier: 0, priority: 8 },
    { model: 'gemini-pro-latest', cost_tier: 2, priority: 30 },
  ];
  assert.deepEqual(buildTierModelCandidates('gemini', gm, 'gemini-2.0-flash').map((m) => m.model), ['gemini-flash-lite-latest']);
  assert.deepEqual(buildTierModelCandidates('gemini', gm, 'gemini-2.5-flash').map((m) => m.model), ['gemini-2.5-flash', 'gemini-flash-lite-latest']);
  assert.deepEqual(buildTierModelCandidates('gemini', gm, null).map((m) => m.model), ['gemini-flash-lite-latest']);

  const om = [
    { model: 'nvidia/nemotron-3-super-120b-a12b:free', cost_tier: 0 },
    { model: 'nex-agi/nex-n2.5-pro:free', cost_tier: 0 },
    { model: 'deepseek/deepseek-v4-flash', cost_tier: 1 },
    { model: 'google/gemma-4-31b-it:free', cost_tier: 0 },
  ];
  assert.deepEqual(
    buildTierModelCandidates('openrouter', om).map((m) => m.model),
    ['nvidia/nemotron-3-super-120b-a12b:free', 'nex-agi/nex-n2.5-pro:free', 'google/gemma-4-31b-it:free'],
    'openrouter: every FREE model in priority order, paid rows excluded',
  );
}

// --- 5. shell quoting is literal ----------------------------------------------------------
{
  const evil = "note `superseded_note` and $(echo PWNED) and $HOME and it's";
  const quoted = shSingleQuote(evil);
  const echoed = execFileSync('sh', ['-c', `printf %s ${quoted}`]).toString();
  assert.equal(echoed, evil, 'single-quoted body must reach the command byte-for-byte');
  const cmd = buildLocalGenerateCmd('http://localhost:11434', 'axon-ornith:latest', evil);
  assert.match(cmd, /^curl -s -m \d+ http:\/\/localhost:11434\/api\/generate -d '/, 'still matches the allowlisted template');
  const bodyArg = execFileSync('sh', ['-c', `printf %s ${cmd.split(' -d ')[1]}`]).toString();
  assert.equal(JSON.parse(bodyArg).prompt, evil);
}

// --- 3. blocked job is terminal immediately --------------------------------------------
{
  let polls = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('nvg_mini_jobs') && opts.method === 'POST') return json([{ id: 7 }]);
    if (u.includes('nvg_mini_jobs')) {
      polls += 1;
      return json([{ status: 'blocked_needs_jb', result: null, error: null }]);
    }
    return json([]);
  };
  const started = Date.now();
  const out = await queueMiniShellJobDetailed('k', buildLocalGenerateCmd('http://localhost:11434', 'm', 'hi'), {
    title: 't',
    maxWaitMs: 130_000,
    timeoutS: 120,
  });
  globalThis.fetch = originalFetch;
  assert.equal(out.blocked, true);
  assert.equal(out.stdout, null);
  assert.equal(polls, 1, 'stops polling on the first blocked read');
  assert.ok(Date.now() - started < 10_000, 'no wait-out of the 130s budget');
}

// --- 4. card dedupe -------------------------------------------------------------------------
{
  const posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || 'GET') === 'POST') {
      posts.push(u);
      return json([]);
    }
    if (u.includes('agent_dispatch')) return json([{ code: 'MINI-BLOCKED-1' }]); // already open
    return json([]);
  };
  await blockUnclassifiedMiniShellJob('k', { title: 'same', cmd: 'rm -rf /x', riskFlag: 'high', riskReason: 'r' });
  globalThis.fetch = originalFetch;
  assert.equal(posts.filter((u) => u.includes('nvg_mini_jobs')).length, 1, 'audit row still written');
  assert.equal(posts.filter((u) => u.includes('agent_dispatch')).length, 0, 'no second card within 24h');
}

// --- 1+2+3 end to end through axonGenerate ------------------------------------------------
{
  const ROUTES = {
    'ollama-local': { id: 'r-local', name: 'ollama-local', base_url: 'http://localhost:11434', enabled: true },
    'runpod-axon-v1': { id: 'r-runpod', name: 'runpod-axon-v1', base_url: null, secret_key: 'RUNPOD_AXON_V1_KEY', enabled: true },
    openrouter: { id: 'r-or', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true },
    'gemini-api': { id: 'r-gem', name: 'gemini-api', base_url: null, secret_key: 'GEMINI_API_KEY', enabled: true },
    'anthropic-api': { id: 'r-an', name: 'anthropic-api', base_url: null, secret_key: 'ANTHROPIC_API_KEY', enabled: true },
  };
  const MODELS = {
    'r-local': [{ model: 'axon-ornith:latest', cost_tier: 0 }],
    'r-runpod': [{ model: 'axon-v1', cost_tier: 0 }],
    'r-or': [
      { model: 'or-free-a:free', cost_tier: 0 },
      { model: 'or-free-b:free', cost_tier: 0 },
    ],
    'r-gem': [{ model: 'gemini-flash-lite-latest', cost_tier: 0 }],
    'r-an': [{ model: 'claude-x', cost_tier: 3 }],
  };
  const SECRETS = { OPENROUTER_API_KEY: 'k', GEMINI_API_KEY: 'k', GEMINI_API_KEY_BACKUP: 'kb', GEMINI_MODEL: 'gemini-2.0-flash' };

  async function run({ orBehaviour, gemOk }) {
    const calls = [];
    let miniInserts = 0;
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      const body = opts.body ? JSON.parse(opts.body) : null;
      if (u.includes('/rest/v1/axon_llm_chain')) return json([]);
      if (u.includes('/rest/v1/router_routes')) {
        const name = decodeURIComponent(new URL(u).searchParams.get('name')?.replace('eq.', '') || '');
        return json(ROUTES[name] ? [ROUTES[name]] : []);
      }
      if (u.includes('/rest/v1/router_models')) {
        const rid = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
        return json(MODELS[rid] || []);
      }
      if (u.includes('/rest/v1/ni_platform_secrets')) {
        const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
        return json(SECRETS[key] ? [{ value: SECRETS[key] }] : []);
      }
      if (u.includes('/rest/v1/nvg_mini_jobs') && opts.method === 'POST' && body?.status === 'queued') {
        miniInserts += 1;
        return json([{ id: miniInserts }]);
      }
      if (u.includes('/rest/v1/nvg_mini_jobs') && (opts.method || 'GET') === 'GET') {
        return json([{ status: 'blocked_needs_jb' }]);
      }
      if (u.includes('openrouter.ai')) {
        calls.push(`or:${body.model}`);
        assert.deepEqual(body.reasoning, { effort: 'low', exclude: true });
        return orBehaviour(body.model);
      }
      if (u.includes('generativelanguage.googleapis.com')) {
        const model = u.split('/models/')[1].split(':')[0];
        calls.push(`gem:${model}`);
        if (model === 'gemini-2.0-flash') return { ok: false, status: 404, json: async () => ({}) };
        return gemOk ? json({ candidates: [{ content: { parts: [{ text: 'gemini says hi' }] } }] }) : { ok: false, status: 503, json: async () => ({}) };
      }
      return json([]);
    };
    const started = Date.now();
    try {
      const out = await axonGenerate('k', { system: 's', user: 'u', agentName: 'test', kind: 'cheap_chat' });
      return { out, calls, miniInserts, ms: Date.now() - started };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // openrouter model A returns empty content, B answers
  const a = await run({
    orBehaviour: (m) => json({ choices: [{ message: { content: m === 'or-free-a:free' ? '' : 'or-b says hi' } }] }),
    gemOk: true,
  });
  assert.equal(a.out.provider, 'openrouter');
  assert.equal(a.out.model, 'or-free-b:free', 'logs the model that actually answered');
  assert.equal(a.out.text, 'or-b says hi');
  assert.equal(a.miniInserts, 1, 'blocked local job is NOT retried');
  assert.ok(a.ms < 20_000, `blocked local tier falls through fast (took ${a.ms}ms)`);

  // openrouter fully down -> gemini: retired override never called, live id answers
  const b = await run({ orBehaviour: () => json({ choices: [{ message: { content: '' } }] }), gemOk: true });
  assert.equal(b.out.provider, 'gemini');
  assert.equal(b.out.model, 'gemini-flash-lite-latest');
  assert.ok(!b.calls.includes('gem:gemini-2.0-flash'), 'retired GEMINI_MODEL override is skipped, not called');
  assert.deepEqual(b.calls.filter((c) => c.startsWith('or:')), ['or:or-free-a:free', 'or:or-free-b:free']);
}

console.log('chain-exhaustion-fix.test.mjs: all assertions passed');
