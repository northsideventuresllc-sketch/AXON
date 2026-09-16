#!/usr/bin/env node
/**
 * sbPost (internal to lib/axon-router-core.mjs) must never fail silently --
 * PULSE-LASTFIRED-COSTLEDGER-AXON-GAP-0909 found axon_cost_ledger sitting at
 * zero rows since table creation with no log trace anywhere to say why.
 * sbPost is not exported, so it's exercised through its public door,
 * recordLlmUsage.
 *
 * Run: node tests/sb-post-failure-logging.test.mjs
 */
import assert from 'node:assert/strict';
import { recordLlmUsage } from '../lib/axon-router-core.mjs';

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

function withFetchAndLog(handler, fn) {
  globalThis.fetch = handler;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  return fn(logs).finally(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });
}

// --- a non-ok HTTP response logs a structured line naming the table and status ---
await withFetchAndLog(
  async () => ({ ok: false, status: 403, text: async () => 'RLS policy violation' }),
  async (logs) => {
    const ok = await recordLlmUsage('fake-key', { provider: 'anthropic', tokensIn: 1, tokensOut: 1 });
    assert.equal(ok, false);
    const hit = logs.find((l) => l.includes('sbPost_failed'));
    assert.ok(hit, `expected a sbPost_failed log line, got: ${JSON.stringify(logs)}`);
    assert.match(hit, /axon_cost_ledger/);
    assert.match(hit, /403/);
  },
);

// --- a thrown network error logs a structured line too, still resolves false ---
await withFetchAndLog(
  async () => {
    throw new Error('network down');
  },
  async (logs) => {
    const ok = await recordLlmUsage('fake-key', { provider: 'runpod' });
    assert.equal(ok, false);
    const hit = logs.find((l) => l.includes('sbPost_threw'));
    assert.ok(hit, `expected a sbPost_threw log line, got: ${JSON.stringify(logs)}`);
    assert.match(hit, /network down/);
  },
);

console.log('sb-post-failure-logging.test.mjs: all assertions passed');
