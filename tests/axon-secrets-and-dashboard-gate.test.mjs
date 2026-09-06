#!/usr/bin/env node
/**
 * AX-DASHBOARD-SECRET-OWN-0906 (Build Plan A, ticket A6): the dashboard secret must be
 * its own secret, never derived from (or falling back to) a slice of the Supabase
 * service key.
 *
 * Proves:
 *  - lib/axon-secrets.mjs throws when the relevant env var is unset, and never reads
 *    the service key as a fallback for the dashboard secret.
 *  - lib/axon-dashboard-gate.mjs's pure auth decision refuses (not "authenticated with
 *    a derived value") when the dashboard secret is unset, independent of Next.js.
 *
 * Run: node tests/axon-secrets-and-dashboard-gate.test.mjs
 */
import assert from 'node:assert/strict';
import {
  getSupabaseServiceKey,
  tryGetSupabaseServiceKey,
  getDashboardSecret,
  tryGetDashboardSecret,
} from '../lib/axon-secrets.mjs';
import { evaluateDashboardAuth } from '../lib/axon-dashboard-gate.mjs';

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// --- getDashboardSecret / getSupabaseServiceKey throw when unset -------------------------
withEnv(
  { AXON_DASHBOARD_SECRET: undefined, SUPABASE_SERVICE_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
  () => {
    assert.throws(() => getDashboardSecret(), /AXON_DASHBOARD_SECRET is not configured/);
    assert.throws(() => getSupabaseServiceKey(), /SUPABASE_SERVICE_KEY.*not configured/);
    assert.equal(tryGetDashboardSecret(), null);
    assert.equal(tryGetSupabaseServiceKey(), null);
  },
);

// --- getDashboardSecret returns the value when set, and does NOT fall back to the -------
// --- service key when only the service key is set (the exact bug being fixed) -----------
withEnv(
  { AXON_DASHBOARD_SECRET: undefined, SUPABASE_SERVICE_KEY: 'a-service-role-key-that-is-long' },
  () => {
    assert.throws(
      () => getDashboardSecret(),
      /AXON_DASHBOARD_SECRET is not configured/,
      'must never derive the dashboard secret from the service key',
    );
    assert.equal(tryGetDashboardSecret(), null);
    // the service key accessor itself still resolves — this only proves the dashboard
    // secret accessor does not silently borrow it.
    assert.equal(getSupabaseServiceKey(), 'a-service-role-key-that-is-long');
  },
);

withEnv({ AXON_DASHBOARD_SECRET: 'real-dashboard-secret' }, () => {
  assert.equal(getDashboardSecret(), 'real-dashboard-secret');
  assert.equal(tryGetDashboardSecret(), 'real-dashboard-secret');
});

withEnv(
  { SUPABASE_SERVICE_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: 'role-key-value' },
  () => {
    assert.equal(getSupabaseServiceKey(), 'role-key-value', 'falls back to the ROLE_KEY env name');
  },
);

// --- evaluateDashboardAuth: pure middleware decision logic -------------------------------

// No secret configured at all -> refuse (503), regardless of any cookie value.
assert.deepEqual(
  evaluateDashboardAuth({ secret: null, sessionCookie: undefined }),
  { outcome: 'secret_not_configured' },
);
assert.deepEqual(
  evaluateDashboardAuth({ secret: null, sessionCookie: 'anything' }),
  { outcome: 'secret_not_configured' },
  'must refuse even if a cookie happens to be present — there is nothing valid to check it against',
);
assert.deepEqual(
  evaluateDashboardAuth({ secret: '', sessionCookie: undefined }),
  { outcome: 'secret_not_configured' },
);

// Secret configured, cookie missing/mismatched -> unauthenticated (login flow / 401), not a refusal.
assert.deepEqual(
  evaluateDashboardAuth({ secret: 'real-secret', sessionCookie: undefined }),
  { outcome: 'unauthenticated' },
);
assert.deepEqual(
  evaluateDashboardAuth({ secret: 'real-secret', sessionCookie: 'wrong-value' }),
  { outcome: 'unauthenticated' },
);

// Secret configured, cookie matches -> authenticated.
assert.deepEqual(
  evaluateDashboardAuth({ secret: 'real-secret', sessionCookie: 'real-secret' }),
  { outcome: 'authenticated' },
);

console.log('axon-secrets-and-dashboard-gate.test.mjs: all assertions passed');
