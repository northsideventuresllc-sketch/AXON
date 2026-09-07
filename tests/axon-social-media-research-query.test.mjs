// RESEARCH-6of6-QUERY-BUILD-0907: per-venture SerpApi query construction
// (brand handle + site: anchor from the venture's own domain) so a small,
// pre-launch product like BridgeAI/GapScan gets a real fallback query
// instead of NO_RESULTS from one generic search.
// SERPAPI-SHARED-QUOTA-STARVING-RESEARCH-0906: loadScaffoldConfig must read
// the dedicated SERPAPI_API_KEY_AXON before the shared SERPAPI_API_KEY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialQueries } from '../scripts/axon-social-media-research.mjs';
import { loadScaffoldConfig } from '../lib/axon-content-scaffold-shared.mjs';

test('buildSocialQueries: established brand with a value prop gets one generic niche query plus a site-anchored fallback', () => {
  const brand = {
    name: 'Match Fit',
    slug: 'match-fit',
    skeleton: { value_props: [{ text: 'coach matching' }] },
    cta_paths: { main: 'https://match-fit.net' },
  };
  const queries = buildSocialQueries(brand);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /"Match Fit"/);
  assert.match(queries[0], /coach matching/);
  assert.match(queries[1], /site:match-fit\.net/);
});

test('buildSocialQueries: small pre-launch product (BridgeAI-shaped row) still gets a site-anchored fallback query', () => {
  const brand = {
    name: 'BridgeAI',
    slug: 'bridgeai',
    venture: 'NI Marketing',
    skeleton: { value_props: [{ text: 'Bridge legacy workflows to AI without rebuild' }] },
    cta_paths: ['https://northsideintelligence.com/toolkit/bridgeai'],
  };
  const queries = buildSocialQueries(brand);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /"BridgeAI"/);
  assert.match(queries[1], /"BridgeAI"/);
  assert.match(queries[1], /site:northsideintelligence\.com/);
  assert.match(queries[1], /northsideintelligence\.com/);
});

test('buildSocialQueries: no usable domain in cta_paths -> generic query only, no crash', () => {
  const brand = { name: 'No Domain Co', slug: 'no-domain-co', skeleton: {} };
  const queries = buildSocialQueries(brand);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /"No Domain Co"/);
});

test('buildSocialQueries: brand name only (no distinct value-prop keyword) does not duplicate an OR clause', () => {
  const brand = { name: 'Solo Brand', slug: 'solo-brand' };
  const queries = buildSocialQueries(brand);
  assert.equal(queries[0].includes(' OR ('), false);
});

test('loadScaffoldConfig: dedicated SERPAPI_API_KEY_AXON wins over the shared SERPAPI_API_KEY', async () => {
  const prevAxon = process.env.SERPAPI_API_KEY_AXON;
  const prevShared = process.env.SERPAPI_API_KEY;
  const prevSupa = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SERPAPI_API_KEY_AXON = 'dedicated-axon-key';
  process.env.SERPAPI_API_KEY = 'shared-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb-key';
  try {
    const sbSelect = async () => { throw new Error('sbSelect should not be called when env vars are set'); };
    const cfg = await loadScaffoldConfig(sbSelect);
    assert.equal(cfg.serpApiKey, 'dedicated-axon-key');
  } finally {
    if (prevAxon === undefined) delete process.env.SERPAPI_API_KEY_AXON; else process.env.SERPAPI_API_KEY_AXON = prevAxon;
    if (prevShared === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = prevShared;
    if (prevSupa === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupa;
  }
});

test('loadScaffoldConfig: falls back to the shared SERPAPI_API_KEY (env or secrets table) when the dedicated key is unset', async () => {
  const prevAxon = process.env.SERPAPI_API_KEY_AXON;
  const prevShared = process.env.SERPAPI_API_KEY;
  const prevSupa = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SERPAPI_API_KEY_AXON;
  process.env.SERPAPI_API_KEY = 'shared-key-only';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb-key';
  try {
    const sbSelect = async () => { throw new Error('sbSelect should not be called when SERPAPI_API_KEY env var is set'); };
    const cfg = await loadScaffoldConfig(sbSelect);
    assert.equal(cfg.serpApiKey, 'shared-key-only');
  } finally {
    if (prevAxon === undefined) delete process.env.SERPAPI_API_KEY_AXON; else process.env.SERPAPI_API_KEY_AXON = prevAxon;
    if (prevShared === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = prevShared;
    if (prevSupa === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupa;
  }
});

test('loadScaffoldConfig: with neither env var set, reads the dedicated key from the secrets table before the shared one', async () => {
  const prevAxon = process.env.SERPAPI_API_KEY_AXON;
  const prevShared = process.env.SERPAPI_API_KEY;
  const prevSupa = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SERPAPI_API_KEY_AXON;
  delete process.env.SERPAPI_API_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb-key';
  try {
    const calls = [];
    const sbSelect = async (table, qs) => {
      calls.push(qs);
      if (qs.includes('SERPAPI_API_KEY_AXON')) return [{ value: 'from-db-dedicated' }];
      if (qs.includes('SERPAPI_API_KEY')) return [{ value: 'from-db-shared' }];
      return [];
    };
    const cfg = await loadScaffoldConfig(sbSelect);
    assert.equal(cfg.serpApiKey, 'from-db-dedicated');
    assert.ok(calls.some((q) => q.includes('SERPAPI_API_KEY_AXON')));
  } finally {
    if (prevAxon === undefined) delete process.env.SERPAPI_API_KEY_AXON; else process.env.SERPAPI_API_KEY_AXON = prevAxon;
    if (prevShared === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = prevShared;
    if (prevSupa === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupa;
  }
});
