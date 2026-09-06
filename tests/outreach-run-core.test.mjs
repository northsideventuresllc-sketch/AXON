#!/usr/bin/env node
/**
 * A9 — direct unit tests for lib/outreach-run-core.mjs.
 * Run: node tests/outreach-run-core.test.mjs
 *
 * Both exported async functions short-circuit before any network call when
 * no Supabase service key is configured, so the "not configured" paths are
 * genuinely offline-testable. clampMax is pure and exported directly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampMax,
  dispatchOutreachRun,
  fetchLatestOutreachRun,
} from '../lib/outreach-run-core.mjs';

const ENV_KEYS = ['SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

function withNoSupabaseKey(fn) {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

test('clampMax: defaults to 3 when omitted/invalid', () => {
  assert.equal(clampMax(undefined), 3);
  assert.equal(clampMax(null), 3);
  assert.equal(clampMax('not-a-number'), 3);
  assert.equal(clampMax(0), 3);
  assert.equal(clampMax(-5), 3);
});

test('clampMax: passes through valid values 1-10', () => {
  assert.equal(clampMax(1), 1);
  assert.equal(clampMax(5), 5);
  assert.equal(clampMax(10), 10);
  assert.equal(clampMax('7'), 7);
});

test('clampMax: caps above 10 (the JB 10-pending-per-venture rule)', () => {
  assert.equal(clampMax(11), 10);
  assert.equal(clampMax(999), 10);
});

test('dispatchOutreachRun: throws a plain-English error with no Supabase key configured', () =>
  withNoSupabaseKey(async () => {
    await assert.rejects(
      () => dispatchOutreachRun({ max: 3, venture: 'ni' }),
      /not configured/i,
    );
  }));

test('fetchLatestOutreachRun: reports unconfigured with no Supabase key, no network call', () =>
  withNoSupabaseKey(async () => {
    const result = await fetchLatestOutreachRun();
    assert.deepEqual(result, { configured: false, run: null });
  }));
