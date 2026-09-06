#!/usr/bin/env node
/**
 * A9 — direct unit tests for lib/axon-fire-gate-core.mjs.
 * Run: node tests/axon-fire-gate-core.test.mjs
 *
 * No network: with no SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY set,
 * readNiBrainMode() short-circuits before ever touching the network, so
 * getFireMode() resolves purely from env + the HOLD default.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRE_BLOCKED_ACTIONS,
  FIRE_GATE_SECRET_KEY,
  FireHoldError,
  assertFireAllowed,
  getFireMode,
  isFireAllowed,
} from '../lib/axon-fire-gate-core.mjs';

const ENV_KEYS = [
  'AXON_FIRE_MODE',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

function withCleanEnv(fn) {
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

test('FIRE_GATE_SECRET_KEY and FIRE_BLOCKED_ACTIONS are stable', () => {
  assert.equal(FIRE_GATE_SECRET_KEY, 'AXON_FIRE_MODE');
  assert.ok(Array.isArray(FIRE_BLOCKED_ACTIONS));
  assert.ok(FIRE_BLOCKED_ACTIONS.length > 0);
  for (const a of FIRE_BLOCKED_ACTIONS) {
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.label, 'string');
    assert.equal(typeof a.detail, 'string');
  }
});

test('getFireMode defaults to HOLD when no env and no NI-Brain key', () =>
  withCleanEnv(async () => {
    const result = await getFireMode();
    assert.equal(result.mode, 'HOLD');
    assert.equal(result.source, 'default');
    assert.equal(result.blocked, FIRE_BLOCKED_ACTIONS);
  }));

test('getFireMode honors AXON_FIRE_MODE=FIRE env override', () =>
  withCleanEnv(async () => {
    process.env.AXON_FIRE_MODE = 'FIRE';
    const result = await getFireMode();
    assert.equal(result.mode, 'FIRE');
    assert.equal(result.source, 'env');
  }));

test('getFireMode normalizes common synonyms (on/off/live/go/safe)', () =>
  withCleanEnv(async () => {
    process.env.AXON_FIRE_MODE = 'on';
    assert.equal((await getFireMode()).mode, 'FIRE');
    process.env.AXON_FIRE_MODE = 'safe';
    assert.equal((await getFireMode()).mode, 'HOLD');
  }));

test('getFireMode falls back to default HOLD on garbage env value', () =>
  withCleanEnv(async () => {
    process.env.AXON_FIRE_MODE = 'not-a-real-mode';
    const result = await getFireMode();
    assert.equal(result.mode, 'HOLD');
    assert.equal(result.source, 'default');
  }));

test('isFireAllowed is false on HOLD, true on FIRE', () =>
  withCleanEnv(async () => {
    assert.equal(await isFireAllowed(), false);
    process.env.AXON_FIRE_MODE = 'FIRE';
    assert.equal(await isFireAllowed(), true);
  }));

test('assertFireAllowed throws FireHoldError while on HOLD', () =>
  withCleanEnv(async () => {
    await assert.rejects(() => assertFireAllowed('outreach.run'), FireHoldError);
    try {
      await assertFireAllowed('outreach.run');
      assert.fail('expected assertFireAllowed to throw');
    } catch (err) {
      assert.ok(err instanceof FireHoldError);
      assert.equal(err.status, 423);
      assert.equal(err.action, 'outreach.run');
      assert.match(err.message, /HOLD/);
    }
  }));

test('assertFireAllowed resolves without throwing once FIRE is set', () =>
  withCleanEnv(async () => {
    process.env.AXON_FIRE_MODE = 'FIRE';
    await assert.doesNotReject(() => assertFireAllowed('outreach.run'));
  }));
