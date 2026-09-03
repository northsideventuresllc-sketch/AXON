#!/usr/bin/env node
/**
 * recordLlmUsage — Phase A3 (agentic-os-phase2-harness-usage.md). Proves the ledger writer
 * shapes the row correctly and never throws, since usage logging must not break a live call.
 *
 * Run: node tests/record-llm-usage.test.mjs
 */
import assert from 'node:assert/strict';
import { recordLlmUsage } from '../lib/axon-router-core.mjs';

const originalFetch = globalThis.fetch;
function withFetch(handler, fn) {
  globalThis.fetch = handler;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// --- 1. happy path writes the expected shape to axon_cost_ledger ----------------------
await withFetch(
  async (url, opts) => {
    assert.ok(String(url).includes('/rest/v1/axon_cost_ledger'));
    const body = JSON.parse(opts.body);
    assert.equal(body.agent_name, 'matchfit-ai-vault');
    assert.equal(body.provider, 'gemini');
    assert.equal(body.model, 'gemini-1.5-flash');
    assert.equal(body.input_tokens, 120);
    assert.equal(body.output_tokens, 45);
    assert.equal(body.total_tokens, 165);
    assert.equal(body.ms, 812);
    assert.ok(body.called_at);
    return { ok: true, status: 200 };
  },
  async () => {
    const ok = await recordLlmUsage('fake-key', {
      agentName: 'matchfit-ai-vault',
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      tokensIn: 120,
      tokensOut: 45,
      costUsd: 0,
      ms: 812,
      venture: 'match-fit',
      product: 'coach-matching',
      meta: { route: 'primary' },
    });
    assert.equal(ok, true);
  },
);

// --- 2. missing key never throws, never calls fetch ------------------------------------
await withFetch(
  async () => {
    throw new Error('fetch must not be called without a supabaseKey');
  },
  async () => {
    const ok = await recordLlmUsage(undefined, { provider: 'gemini' });
    assert.equal(ok, false);
  },
);

// --- 3. a failed write resolves false, never throws -------------------------------------
await withFetch(
  async () => ({ ok: false, status: 500 }),
  async () => {
    const ok = await recordLlmUsage('fake-key', { provider: 'anthropic', tokensIn: 1, tokensOut: 1 });
    assert.equal(ok, false);
  },
);

// --- 4. a thrown network error resolves false, never throws -----------------------------
await withFetch(
  async () => {
    throw new Error('network down');
  },
  async () => {
    const ok = await recordLlmUsage('fake-key', { provider: 'runpod' });
    assert.equal(ok, false);
  },
);

console.log('record-llm-usage.test.mjs: all assertions passed');
