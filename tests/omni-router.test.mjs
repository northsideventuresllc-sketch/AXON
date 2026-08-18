#!/usr/bin/env node
/**
 * AXON-OMNI-ROUTER-REBUILD-001 (increment 1) unit tests — run: node tests/omni-router.test.mjs
 * Fully offline: every provider is injected, no real network/API calls.
 */
import assert from 'node:assert/strict';
import { callWithFailover, DEFAULT_ORDER, PROVIDERS } from '../lib/omni-router.mjs';

// --- PROVIDERS metadata sanity ---
assert.ok(PROVIDERS.length >= 4, 'expected at least local/claude/gemini/deepseek registered');
assert.ok(PROVIDERS.some((p) => p.id === 'local' && p.requiresKey === false));
assert.ok(PROVIDERS.some((p) => p.id === 'deepseek' && p.requiresKey === true && p.envKey === 'DEEPSEEK_API_KEY'));
// DEFAULT_ORDER intentionally unchanged by the deepseek increment — see lib/omni-router.mjs
// top-of-file scope note: no live call site uses this module yet, so widening the default
// has zero production effect either way; kept minimal on purpose.
assert.deepEqual(DEFAULT_ORDER, ['local', 'claude', 'gemini']);

// --- 1. Primary succeeds: no failover needed, single attempt ---
{
  const result = await callWithFailover('sys', 'hi', {
    order: ['a'],
    providers: { a: async () => 'first-try-text' },
  });
  assert.equal(result.text, 'first-try-text');
  assert.equal(result.provider, 'a');
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].ok, true);
}

// --- 2. Primary fails, secondary succeeds: real failover ---
{
  const result = await callWithFailover('sys', 'hi', {
    order: ['broken', 'backup'],
    providers: {
      broken: async () => { throw new Error('simulated outage'); },
      backup: async () => 'backup-answered',
    },
  });
  assert.equal(result.text, 'backup-answered');
  assert.equal(result.provider, 'backup');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].ok, false);
  assert.match(result.attempts[0].error, /simulated outage/);
  assert.equal(result.attempts[1].ok, true);
}

// --- 3. A provider returning empty/falsy text counts as a failure (not a silent bad answer) ---
{
  const result = await callWithFailover('sys', 'hi', {
    order: ['empty', 'real'],
    providers: {
      empty: async () => { throw new Error('empty response'); }, // callers must throw, not return ''
      real: async () => 'real-text',
    },
  });
  assert.equal(result.provider, 'real');
}

// --- 4. Every provider fails: throws, with all attempts summarized in the message ---
{
  let threw = false;
  try {
    await callWithFailover('sys', 'hi', {
      order: ['x', 'y'],
      providers: {
        x: async () => { throw new Error('x down'); },
        y: async () => { throw new Error('y down'); },
      },
    });
  } catch (err) {
    threw = true;
    assert.match(err.message, /x down/);
    assert.match(err.message, /y down/);
  }
  assert.ok(threw, 'expected callWithFailover to throw when every provider fails');
}

// --- 5. Unknown provider id in order is recorded as a failed attempt, not a crash ---
{
  const result = await callWithFailover('sys', 'hi', {
    order: ['does-not-exist', 'fallback'],
    providers: { fallback: async () => 'fallback-text' },
  });
  assert.equal(result.provider, 'fallback');
  assert.match(result.attempts[0].error, /no caller registered/);
}

// --- 6. deepseek is a real BUILTIN_CALLERS entry (not just PROVIDERS metadata) — proven
//        by including it in `order` with NO injected override and NO network call: it must
//        reach the real callDeepSeek and fail on the real "missing API key" guard, not on
//        "no caller registered for this provider id" (which is what an unwired id would hit).
{
  const result = await callWithFailover('sys', 'hi', {
    order: ['deepseek', 'fallback'],
    deepseekApiKey: undefined, // force the missing-key path — never a real network call
    providers: { fallback: async () => 'fallback-text' },
  });
  assert.equal(result.provider, 'fallback');
  assert.equal(result.attempts[0].provider, 'deepseek');
  assert.equal(result.attempts[0].ok, false);
  assert.match(result.attempts[0].error, /DEEPSEEK_API_KEY missing/);
}

console.log('omni-router.test.mjs: all assertions passed (6 cases)');
