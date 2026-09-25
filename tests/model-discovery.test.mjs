#!/usr/bin/env node
/**
 * LIVE MODEL DISCOVERY (JB live requirement 2026-09-24): the chain never calls a model id the
 * provider's live catalog lacks, and picks each provider's newest free model automatically.
 * Mocked catalogs only — no network.
 *
 * Run: node tests/model-discovery.test.mjs
 */
import assert from 'node:assert/strict';
import {
  rankGeminiModels,
  rankOpenRouterModels,
  rankAnthropicModels,
  parseOllamaTags,
  buildCandidates,
  getLiveModels,
  invalidateModelCache,
  isModelNotFoundError,
  __resetModelDiscoveryCache,
} from '../lib/axon-model-discovery.mjs';
import { axonGenerate } from '../lib/axon-router-core.mjs';
import { classifyMiniShellRisk } from '../lib/nvg-mini-risk-gate.mjs';

const json = (v, status = 200) => ({ ok: status < 400, status, json: async () => v, text: async () => JSON.stringify(v) });
const originalFetch = globalThis.fetch;

// Shaped like the live 2026-09-24 catalogs.
const GEMINI_LIST = {
  models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-1.9-flash', supportedGenerationMethods: ['generateContent'], description: 'Deprecated; will be discontinued.' },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ],
};
const OPENROUTER_LIST = {
  data: [
    { id: 'old/free-chat:free', created: 1700000000, context_length: 32000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'], architecture: { output_modalities: ['text'] } },
    { id: 'new/reasoner:free', created: 1790000000, context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning'], architecture: { output_modalities: ['text'] } },
    { id: 'new/chat:free', created: 1789000000, context_length: 131072, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'], architecture: { output_modalities: ['text'] } },
    { id: 'paid/model', created: 1791000000, context_length: 1000000, pricing: { prompt: '0.0000001', completion: '0.0000004' }, architecture: { output_modalities: ['text'] } },
    { id: 'nvidia/content-safety:free', created: 1791000000, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    { id: 'img/gen:free', created: 1791000000, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
  ],
};
const ANTHROPIC_LIST = {
  data: [
    { id: 'claude-sonnet-5', created_at: '2026-06-01T00:00:00Z' },
    { id: 'claude-haiku-4-5', created_at: '2025-10-01T00:00:00Z' },
    { id: 'claude-haiku-5', created_at: '2026-07-01T00:00:00Z' },
    { id: 'claude-opus-5', created_at: '2026-06-01T00:00:00Z' },
  ],
};

// --- 1. pure ranking ------------------------------------------------------------------
{
  const g = rankGeminiModels(GEMINI_LIST.models);
  assert.deepEqual(g, ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'],
    'gemini: stable flash family only, newest version first, preview/tts/image/deprecated/pro dropped, aliases last');

  const o = rankOpenRouterModels(OPENROUTER_LIST.data);
  assert.deepEqual(o, ['new/chat:free', 'old/free-chat:free', 'new/reasoner:free'],
    'openrouter: free (prompt=0 AND completion=0) text models only; non-reasoning first, then newest');

  const a = rankAnthropicModels(ANTHROPIC_LIST.data);
  assert.deepEqual(a.slice(0, 3), ['claude-haiku-5', 'claude-haiku-4-5', 'claude-sonnet-5']);

  assert.deepEqual(parseOllamaTags({ models: [{ name: 'axon-ornith:latest' }, { name: 'nomic-embed-text:latest' }, { name: 'qwen2.5:0.5b' }] }),
    ['axon-ornith:latest', 'qwen2.5:0.5b']);
  assert.equal(parseOllamaTags({ response: 'not tags' }), null);

  // retired pin + a configured id that no longer exists are both ignored when a live list exists
  assert.deepEqual(
    buildCandidates({ live: ['gemini-3.5-flash', 'gemini-2.5-flash'], pins: ['gemini-2.0-flash'], configured: ['gemini-1.5-flash'], pinsFirst: false, provider: 'gemini' }),
    ['gemini-3.5-flash', 'gemini-2.5-flash'],
  );
  // a live pin still goes first
  assert.deepEqual(
    buildCandidates({ live: ['gemini-3.5-flash', 'gemini-2.5-flash'], pins: ['gemini-2.5-flash'], pinsFirst: false })[0],
    'gemini-2.5-flash',
  );
  // catalog unavailable -> configured as-is (degrade to old behaviour, never stall)
  assert.deepEqual(buildCandidates({ live: null, configured: ['x'] }), ['x']);

  assert.ok(isModelNotFoundError(new Error('gemini HTTP 404')));
  assert.ok(isModelNotFoundError(new Error('provider HTTP 400: foo/bar is not a valid model ID')));
  assert.ok(isModelNotFoundError('model "qwen:7b" not found, try pulling it first'));
  assert.ok(!isModelNotFoundError(new Error('anthropic HTTP 400: Your credit balance is too low')));

  // tags read is allowlisted (read-only, fully anchored), anything appended is not
  assert.equal(classifyMiniShellRisk('curl -s -m 10 http://localhost:11434/api/tags').riskFlag, 'low');
  assert.equal(classifyMiniShellRisk('curl -s -m 10 http://localhost:11434/api/tags && rm -rf ~').riskFlag, 'high');
}

// --- 2. cache: fetched once per TTL, invalidated on demand -------------------------------
{
  __resetModelDiscoveryCache();
  let listCalls = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('axon_model_catalog')) return json({ message: 'relation does not exist' }, 404); // DDL not applied
    if (u.includes('openrouter.ai/api/v1/models')) {
      listCalls += 1;
      return json(OPENROUTER_LIST);
    }
    return json([]);
  };
  const first = await getLiveModels('openrouter', { supabaseKey: 'k' });
  const second = await getLiveModels('openrouter', { supabaseKey: 'k' });
  assert.deepEqual(first, second);
  assert.equal(listCalls, 1, 'second read served from the in-process cache');
  await invalidateModelCache('openrouter');
  await getLiveModels('openrouter', { supabaseKey: 'k' });
  assert.equal(listCalls, 2, 'invalidate forces a fresh catalog fetch');
  globalThis.fetch = originalFetch;
}

// --- 3. end to end: retired GEMINI_MODEL pin is never called; newest live flash answers;
//        a 404 on the top candidate invalidates the cache and moves to the next -------------
{
  __resetModelDiscoveryCache();
  const genCalls = [];
  let listCalls = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/axon_llm_chain')) return json([{ tier: 'gemini', position: 0, enabled: true }]);
    if (u.includes('/rest/v1/router_routes')) return json([{ id: 'r-gem', name: 'gemini-api', secret_key: 'GEMINI_API_KEY', enabled: true }]);
    if (u.includes('/rest/v1/router_models')) return json([{ model: 'gemini-flash-lite-latest', cost_tier: 0, priority: 8 }]);
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      const v = { GEMINI_API_KEY: 'gk', GEMINI_MODEL: 'gemini-2.0-flash' }[key];
      return json(v ? [{ value: v }] : []);
    }
    if (u.includes('axon_model_catalog')) return json({}, 404);
    if (u.includes('generativelanguage.googleapis.com') && (opts.method || 'GET') === 'GET') {
      listCalls += 1;
      return json(GEMINI_LIST);
    }
    if (u.includes(':generateContent')) {
      const model = u.split('/models/')[1].split(':')[0];
      genCalls.push(model);
      if (model === 'gemini-3.5-flash') return json({ error: { message: 'not found' } }, 404); // renamed mid-cache
      return json({ candidates: [{ content: { parts: [{ text: `hi from ${model}` }] } }] });
    }
    return json([]);
  };
  const out = await axonGenerate('k', { system: 's', user: 'u', agentName: 'test', kind: 'cheap_chat' });
  globalThis.fetch = originalFetch;
  assert.ok(!genCalls.includes('gemini-2.0-flash'), 'retired pinned id is never called');
  assert.deepEqual(genCalls, ['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  assert.equal(out.provider, 'gemini');
  assert.equal(out.model, 'gemini-3.5-flash-lite');
  assert.equal(listCalls, 1);
}

// --- 4. end to end: local tier swaps to an INSTALLED model on "model not found" -----------
{
  __resetModelDiscoveryCache();
  const generated = [];
  let jobId = 0;
  const jobs = new Map();
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (u.includes('/rest/v1/axon_llm_chain')) return json([{ tier: 'local', position: 0, enabled: true }]);
    if (u.includes('/rest/v1/router_routes')) return json([{ id: 'r-local', name: 'ollama-local', base_url: 'http://localhost:11434', enabled: true }]);
    if (u.includes('/rest/v1/router_models')) return json([{ model: 'axon-gone:latest', cost_tier: 0, priority: 1 }]);
    if (u.includes('axon_model_catalog')) return json({}, 404);
    if (u.includes('/rest/v1/nvg_mini_jobs') && opts.method === 'POST' && body?.status === 'queued') {
      jobId += 1;
      const cmd = body.payload.cmd;
      let stdout;
      if (cmd.endsWith('/api/tags')) {
        stdout = JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }, { name: 'axon-ornith:latest' }] });
      } else {
        const sent = JSON.parse(cmd.split(" -d '")[1].slice(0, -1).replace(/'\\''/g, "'"));
        generated.push(sent.model);
        stdout = sent.model === 'axon-gone:latest'
          ? JSON.stringify({ error: 'model "axon-gone:latest" not found, try pulling it first' })
          : JSON.stringify({ response: `hi from ${sent.model}` });
      }
      jobs.set(jobId, stdout);
      return json([{ id: jobId }]);
    }
    if (u.includes('/rest/v1/nvg_mini_jobs')) {
      const id = Number(new URL(u).searchParams.get('id')?.replace('eq.', ''));
      return json([{ status: 'done', result: { stdout: jobs.get(id) } }]);
    }
    return json([]);
  };
  const out = await axonGenerate('k', { system: 's', user: 'u', agentName: 'test', kind: 'cheap_chat' });
  globalThis.fetch = originalFetch;
  assert.deepEqual(generated, ['axon-gone:latest', 'axon-ornith:latest'], 'axon-* installed model preferred after the miss');
  assert.equal(out.provider, 'local');
  assert.equal(out.model, 'axon-ornith:latest');
}

// --- 5. OpenRouter HTTP 200 carrying an upstream `error` (live nemotron 503) moves on ------
{
  __resetModelDiscoveryCache();
  const tried = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (u.includes('/rest/v1/axon_llm_chain')) return json([{ tier: 'openrouter', position: 0, enabled: true }]);
    if (u.includes('/rest/v1/router_routes')) return json([{ id: 'r-or', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true }]);
    if (u.includes('/rest/v1/router_models')) return json([{ model: 'gone/model:free', cost_tier: 0, priority: 1 }]);
    if (u.includes('/rest/v1/ni_platform_secrets')) return json([{ value: 'ok' }]);
    if (u.includes('axon_model_catalog')) return json({}, 404);
    if (u.includes('openrouter.ai/api/v1/models')) return json(OPENROUTER_LIST);
    if (u.includes('/chat/completions')) {
      tried.push(body.model);
      if (body.model === 'new/chat:free') return json({ error: { code: 503, message: 'Upstream error: Service temporarily overloaded' } });
      return json({ choices: [{ message: { content: `hi from ${body.model}` } }] });
    }
    return json([]);
  };
  const out = await axonGenerate('k', { system: 's', user: 'u', agentName: 'test', kind: 'cheap_chat' });
  globalThis.fetch = originalFetch;
  assert.ok(!tried.includes('gone/model:free'), 'configured id missing from the live catalog is never called');
  assert.deepEqual(tried, ['new/chat:free', 'old/free-chat:free']);
  assert.equal(out.model, 'old/free-chat:free');
}

console.log('model-discovery.test.mjs: all assertions passed');
