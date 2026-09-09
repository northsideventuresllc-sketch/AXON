#!/usr/bin/env node
/**
 * Custom-lane self-serve keys — the route_id-keyed generalization of the account-key store.
 *
 * Proves the whole point of this change: a user can register a BRAND-NEW provider (never
 * seen before, nowhere near CHAIN_PROVIDERS/TIER_KEY_PROVIDER's fixed 5) and paste a real
 * key for it, and that key — not any platform-wide secret — is what actually goes out on
 * the wire the next time that lane is called. No admin action, no whitelist entry.
 *
 * Layered exactly like tests/axon-generate-chain.test.mjs and
 * tests/router-json-mode-max-tokens.test.mjs: mock global.fetch, exercise the real .mjs
 * functions (getAccountKeyForRoute/setAccountKeyForRoute from lib/axon-account-keys.mjs,
 * executeLane from lib/axon-router-core.mjs) — the same functions
 * lib/axon-v0/store.ts's addProvider() and the providers API route call in production.
 *
 * Run: node tests/custom-lane-account-keys.test.mjs
 */
import assert from 'node:assert/strict';
import {
  getAccountKeyForRoute,
  setAccountKeyForRoute,
  decryptProviderKey,
} from '../lib/axon-account-keys.mjs';
import { executeLane } from '../lib/axon-router-core.mjs';

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

/** A tiny in-memory stand-in for the axon_account_provider_keys table + the provider's own
 *  chat endpoint, so a save really has to round-trip through the store before a later call
 *  can see it — proving persistence, not just a same-call echo. */
function makeBackend() {
  const rows = []; // { account_id, route_id, provider, key_ciphertext, last4 }
  const calls = [];
  const fetchMock = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });

    if (u.startsWith('https://provider.example.test')) {
      const auth = opts.headers?.Authorization || '';
      return json({ choices: [{ message: { content: `ok, auth=${auth}` } }] });
    }

    if (u.includes('/rest/v1/axon_account_provider_keys')) {
      const parsed = new URL(u);
      if ((opts.method || 'GET') === 'POST') {
        // Mirrors real PostgREST on_conflict=account_id,route_id upsert semantics.
        const row = opts.body ? JSON.parse(opts.body) : {};
        const existingIdx = rows.findIndex(
          (r) => r.account_id === row.account_id && r.route_id === row.route_id && row.route_id != null,
        );
        if (existingIdx >= 0) rows[existingIdx] = { ...rows[existingIdx], ...row };
        else rows.push({ ...row });
        return json([row]);
      }
      if ((opts.method || 'GET') === 'DELETE') {
        const accountId = parsed.searchParams.get('account_id')?.replace('eq.', '');
        const routeId = parsed.searchParams.get('route_id')?.replace('eq.', '');
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].account_id === accountId && rows[i].route_id === routeId) rows.splice(i, 1);
        }
        return { ok: rows.length < before || before === 0, status: 200, json: async () => [] };
      }
      // GET (select)
      const accountId = parsed.searchParams.get('account_id')?.replace('eq.', '');
      const routeId = parsed.searchParams.get('route_id')?.replace('eq.', '');
      const match = rows.find((r) => r.account_id === accountId && r.route_id === routeId);
      return json(match ? [{ key_ciphertext: match.key_ciphertext, last4: match.last4 }] : []);
    }

    if (u.includes('/rest/v1/ni_platform_secrets')) {
      throw new Error('the platform secret must never be fetched once the account key resolved');
    }

    throw new Error(`unmocked fetch: ${u}`);
  };
  return { fetchMock, rows, calls };
}

const ACCOUNT_ID = 'acct-brand-new-1';
const ROUTE_ID = 'route-custom-lane-uuid-1';

// --- 1. round trip: set then get, with a brand-new provider name nowhere in CHAIN_PROVIDERS ---
{
  const { fetchMock, rows } = makeBackend();
  await withFetch(fetchMock, async () => {
    const saved = await setAccountKeyForRoute('fake-supabase-key', ACCOUNT_ID, ROUTE_ID, 'sk-my-brand-new-key-77991');
    assert.equal(saved.last4, '7991');

    // stored encrypted at rest, never plaintext
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].key_ciphertext, 'sk-my-brand-new-key-77991');
    assert.equal(decryptProviderKey(rows[0].key_ciphertext), 'sk-my-brand-new-key-77991');
    assert.equal(rows[0].provider, null, 'route-keyed rows carry no provider — no whitelist involved');

    const fetched = await getAccountKeyForRoute('fake-supabase-key', ACCOUNT_ID, ROUTE_ID);
    assert.equal(fetched.key, 'sk-my-brand-new-key-77991');
    assert.equal(fetched.last4, '7991');
  });
}

// --- 2. re-saving the same lane's key upserts in place (on_conflict=account_id,route_id),
//     it does not accumulate a second row --------------------------------------------------
{
  const { fetchMock, rows } = makeBackend();
  await withFetch(fetchMock, async () => {
    await setAccountKeyForRoute('fake-supabase-key', ACCOUNT_ID, ROUTE_ID, 'sk-first-key');
    await setAccountKeyForRoute('fake-supabase-key', ACCOUNT_ID, ROUTE_ID, 'sk-rotated-key');
    assert.equal(rows.length, 1, 'saving a new key for the same account+lane must upsert, not duplicate');
    const fetched = await getAccountKeyForRoute('fake-supabase-key', ACCOUNT_ID, ROUTE_ID);
    assert.equal(fetched.key, 'sk-rotated-key');
  });
}

// --- 3. no row for this account+lane -> null, never throws --------------------------------
await withFetch(makeBackend().fetchMock, async () => {
  const fetched = await getAccountKeyForRoute('fake-supabase-key', 'some-other-account', ROUTE_ID);
  assert.equal(fetched, null);
});

// --- 4. THE END-TO-END PROOF: a brand-new custom lane, zero prior setup. Paste a key for a
//     provider that has never existed before (not in CHAIN_PROVIDERS, not in
//     TIER_ROUTE_NAME/TIER_KEY_PROVIDER — those are the fixed 5). Save it via
//     setAccountKeyForRoute (what addProvider() does server-side when `api_key` is posted to
//     /api/axon-v0/providers). Then call executeLane() on that exact lane, the way routeChat's
//     general capability-scored lane pool does for a real request — the account's own key,
//     not any platform secret, must be what goes out on the wire, and the platform secret
//     endpoint must never even be touched. -------------------------------------------------
{
  const { fetchMock, rows } = makeBackend();
  const CUSTOM_LANE = {
    laneId: 'lane-acme-inference-v1',
    model: 'acme-large-1',
    connectorKind: 'api',
    route: {
      id: ROUTE_ID,
      name: 'acme-inference-1757000000000', // addProvider()'s `${label}-${Date.now()}` shape
      kind: 'api',
      connector_kind: 'api',
      base_url: 'https://provider.example.test/v1',
      // A platform-wide secret_key is deliberately absent here — this is the whole point:
      // a brand-new provider a user just registered has no ni_platform_secrets row and needs
      // none, because its key lives in axon_account_provider_keys keyed to this route_id.
      secret_key: null,
      requires_mini: false,
    },
  };

  await withFetch(fetchMock, async () => {
    // Step A — the paste-a-key flow: encrypt + store, exactly as addProvider() does.
    const { last4 } = await setAccountKeyForRoute(
      'fake-supabase-key',
      ACCOUNT_ID,
      CUSTOM_LANE.route.id,
      'acme-sk-live-brand-new-provider-4242',
    );
    assert.equal(last4, '4242');

    // Step B — a later, independent request routes to this lane (executeLane's 'api'
    // branch, the one the general capability-scored lane pool calls from routeChat).
    const out = await executeLane('fake-supabase-key', CUSTOM_LANE, [{ role: 'user', content: 'hi' }], {
      accountId: ACCOUNT_ID,
    });

    assert.equal(out.reply, 'ok, auth=Bearer acme-sk-live-brand-new-provider-4242');
  });

  // The DB really has exactly the one encrypted row, no plaintext, no provider whitelist.
  assert.equal(rows.length, 1);
  assert.equal(decryptProviderKey(rows[0].key_ciphertext), 'acme-sk-live-brand-new-provider-4242');
}

// --- 5. no account key saved for this lane -> falls back to the platform secret (route
//     .secret_key), same as before this change — a built-in provider with only a platform
//     key configured must keep working exactly as it did. -----------------------------------
{
  const { fetchMock } = makeBackend();
  const LANE_WITH_PLATFORM_SECRET = {
    laneId: 'lane-openrouter',
    model: 'some-model',
    connectorKind: 'api',
    route: {
      id: 'route-openrouter',
      name: 'openrouter',
      kind: 'api',
      connector_kind: 'api',
      base_url: 'https://provider.example.test/v1',
      secret_key: 'TEST_PLATFORM_ONLY_KEY',
      requires_mini: false,
    },
  };
  process.env.TEST_PLATFORM_ONLY_KEY = 'platform-fallback-key';
  await withFetch(fetchMock, async () => {
    const out = await executeLane(
      'fake-supabase-key',
      LANE_WITH_PLATFORM_SECRET,
      [{ role: 'user', content: 'hi' }],
      { accountId: ACCOUNT_ID },
    );
    assert.equal(out.reply, 'ok, auth=Bearer platform-fallback-key');
  });
}

// --- 6. no accountId at all (legacy/bare caller, e.g. a script with no account context) ---
//     must behave exactly as before this change: never even queries
//     axon_account_provider_keys, goes straight to the platform secret. -----------------------
{
  const calls = [];
  const fetchMock = async (url, opts = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/rest/v1/axon_account_provider_keys')) {
      throw new Error('must never be queried when no accountId is passed');
    }
    if (u.startsWith('https://provider.example.test')) {
      return json({ choices: [{ message: { content: `ok, auth=${opts.headers?.Authorization}` } }] });
    }
    throw new Error(`unmocked fetch: ${u}`);
  };
  process.env.TEST_NO_ACCOUNT_KEY = 'bare-caller-platform-key';
  const LANE = {
    laneId: 'lane-bare',
    model: 'm',
    connectorKind: 'api',
    route: {
      id: 'route-bare',
      name: 'some-route',
      kind: 'api',
      connector_kind: 'api',
      base_url: 'https://provider.example.test/v1',
      secret_key: 'TEST_NO_ACCOUNT_KEY',
      requires_mini: false,
    },
  };
  await withFetch(fetchMock, async () => {
    const out = await executeLane('fake-supabase-key', LANE, [{ role: 'user', content: 'hi' }]);
    assert.equal(out.reply, 'ok, auth=Bearer bare-caller-platform-key');
  });
}

console.log('custom-lane-account-keys.test.mjs: all assertions passed');
