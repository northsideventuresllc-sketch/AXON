#!/usr/bin/env node
/**
 * Regression test for a bug surfaced while building TELEGRAM-PER-AGENT-BOT-0827:
 * loadConfig's "TELEGRAM_BOT_TOKEN env doesn't match NI-Brain's bot" self-correction
 * compared cfg.telegramToken (env-or-NI-Brain) against a second env-or-NI-Brain lookup,
 * so the two sides were always equal and the correction could never fire. Fixed by
 * comparing against a NI-Brain-only (env-bypassing) read.
 *
 * Run: node tests/telegram-default-bot-self-correct.test.mjs
 */
import assert from 'node:assert/strict';
import { loadConfig } from '../lib/config.mjs';

const REQUIRED_ENV = {
  SUPABASE_SERVICE_KEY: 'sb-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
  TELEGRAM_BOT_TOKEN: 'stale-env-token',
};

function withEnv(vars, fn) {
  const prior = {};
  for (const k of Object.keys(vars)) prior[k] = process.env[k];
  Object.assign(process.env, vars);
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  });
}

function fakeSbSelect(secrets) {
  return async (table, query) => {
    assert.equal(table, 'ni_platform_secrets');
    const match = /key=eq\.([^&]+)/.exec(query);
    const key = decodeURIComponent(match[1]);
    return key in secrets ? [{ value: secrets[key] }] : [];
  };
}

// Env has a stale token that belongs to some other bot; NI-Brain holds the real one.
// The self-correction must detect the mismatch, verify via getMe, and swap it in.
await withEnv(REQUIRED_ENV, async () => {
  const sbSelect = fakeSbSelect({ TELEGRAM_BOT_TOKEN: 'canonical-nibrain-token' });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(String(url).includes('stale-env-token'), 'must verify the env token, not the NI-Brain one');
    return { json: async () => ({ ok: true, result: { username: 'some_other_bot' } }) };
  };
  try {
    const cfg = await loadConfig(sbSelect);
    assert.equal(cfg.telegramToken, 'canonical-nibrain-token', 'mismatched env token must be swapped for NI-Brain token');
  } finally {
    global.fetch = originalFetch;
  }
});

console.log('telegram-default-bot-self-correct.test.mjs: all assertions passed');
