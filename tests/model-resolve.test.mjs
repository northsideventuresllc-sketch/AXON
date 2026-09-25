#!/usr/bin/env node
/**
 * NO-DEAD-MODELS resolver (2026-09-24): lib/model-resolve.mjs. Mocked catalogs only — no
 * network. Run: node tests/model-resolve.test.mjs
 */
import assert from 'node:assert/strict';
import { resolveModel, resolveModelChain } from '../lib/model-resolve.mjs';
import { __resetModelDiscoveryCache } from '../lib/axon-model-discovery.mjs';
import { resolveGeminiModels, resolveGeminiModelsLive, GEMINI_FALLBACK_MODELS } from '../lib/constants.mjs';

const json = (v, status = 200) => ({ ok: status < 400, status, json: async () => v, text: async () => JSON.stringify(v) });
const originalFetch = globalThis.fetch;

const ANTHROPIC_LIST = {
  data: [
    { id: 'claude-sonnet-6', created_at: '2026-09-20T00:00:00Z' },
    { id: 'claude-sonnet-5', created_at: '2026-08-01T00:00:00Z' },
    { id: 'claude-haiku-6', created_at: '2026-09-15T00:00:00Z' },
  ],
};

const GEMINI_LIST = {
  models: [
    { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
  ],
};

// --- 1. Preferred id still live -> used as-is ---------------------------------------------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) return json(GEMINI_LIST);
    return json({}, 404);
  };
  const id = await resolveModel('gemini', { preferred: 'gemini-2.5-flash', apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.equal(id, 'gemini-2.5-flash');
}

// --- 2. Preferred id retired (not in live catalog) -> newest live model in family ----------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) return json(GEMINI_LIST);
    return json({}, 404);
  };
  const id = await resolveModel('gemini', { preferred: 'gemini-1.5-flash', family: 'gemini-flash', apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.equal(id, 'gemini-3.0-flash', 'retired pin falls through to newest live flash model');
}

// --- 3. Family filter (anthropic-sonnet) skips a newer haiku ------------------------------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.anthropic.com/v1/models')) return json(ANTHROPIC_LIST);
    return json({}, 404);
  };
  const id = await resolveModel('anthropic', { preferred: 'claude-sonnet-4', family: 'anthropic-sonnet', apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.equal(id, 'claude-sonnet-6', 'newest sonnet picked, newer haiku-6 not substituted in');
}

// --- 4. No catalog reachable -> returns preferred unverified, never throws -----------------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  const id = await resolveModel('gemini', { preferred: 'gemini-2.5-flash', apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.equal(id, 'gemini-2.5-flash');
}

// --- 5. No catalog AND no preferred -> null, never throws ----------------------------------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async () => json({}, 500);
  const id = await resolveModel('anthropic', { apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.equal(id, null);
}

// --- 6. resolveModelChain: live-verified preferred + configured fallbacks, deduped ---------
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) return json(GEMINI_LIST);
    return json({}, 404);
  };
  const chain = await resolveModelChain('gemini', {
    preferred: 'gemini-2.5-flash',
    configured: ['gemini-1.5-flash', 'gemini-2.5-pro'],
    apiKey: 'k',
  });
  globalThis.fetch = originalFetch;
  assert.ok(!chain.includes('gemini-1.5-flash'), 'retired configured fallback dropped, never called');
  assert.equal(chain[0], 'gemini-2.5-flash');
}

// --- 7. resolveModelChain: catalog unavailable -> unverified preferred+configured, in order -
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async () => {
    throw new Error('down');
  };
  const chain = await resolveModelChain('gemini', {
    preferred: 'gemini-2.5-flash',
    configured: ['gemini-1.5-flash'],
    apiKey: 'k',
  });
  globalThis.fetch = originalFetch;
  assert.deepEqual(chain, ['gemini-2.5-flash', 'gemini-1.5-flash']);
}

// --- 8. lib/constants.mjs: retired id dropped from default fallback list -------------------
{
  assert.ok(!GEMINI_FALLBACK_MODELS.includes('gemini-1.5-flash'), 'gemini-1.5-flash removed from default fallback constant');
}

// --- 9. resolveGeminiModelsLive degrades to resolveGeminiModels() when catalog is down -----
{
  __resetModelDiscoveryCache();
  globalThis.fetch = async () => {
    throw new Error('down');
  };
  const live = await resolveGeminiModelsLive('gemini-2.5-flash', { apiKey: 'k' });
  globalThis.fetch = originalFetch;
  assert.deepEqual(live, resolveGeminiModels('gemini-2.5-flash'));
}

console.log('model-resolve.test.mjs: all assertions passed');
