#!/usr/bin/env node
/**
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order) — proves the new RunPod (AXON v1) tier:
 *   1. callAxonV1Cloud returns null immediately (no network POST attempted) when
 *      RUNPOD_AXON_V1_ENDPOINT / RUNPOD_AXON_V1_KEY are absent from ni_platform_secrets
 *      (the real state right now — RunPod isn't deployed yet).
 *   2. RunPod is still a real tier of the one locked chain, ahead of the paid lane
 *      (the end-to-end walk of that chain lives in tests/one-router-callers.test.mjs).
 *
 * Run: node tests/runpod-tier.test.mjs
 */
import assert from 'node:assert/strict';
import { callAxonV1Cloud } from '../lib/axon-v1-cloud-relay.mjs';
import { DEFAULT_LLM_CHAIN } from '../lib/axon-router-core.mjs';

// --- 1. callAxonV1Cloud is a no-op when secrets are missing ---------------------------
{
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    // Simulate real current state: ni_platform_secrets has no RunPod rows yet.
    if (String(url).includes('ni_platform_secrets')) {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await callAxonV1Cloud('fake-supabase-key', 'system', 'hello');
  global.fetch = originalFetch;

  assert.equal(result, null, 'callAxonV1Cloud must return null when RunPod secrets are absent');
  assert.equal(calls.length, 2, 'must only query the two secret keys, never attempt a RunPod POST');
  assert.ok(calls.every((u) => u.includes('ni_platform_secrets')), 'no non-secrets network call made');
}

// --- 1b. missing supabaseKey short-circuits with zero network calls -------------------
{
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('should not be called');
  };
  const result = await callAxonV1Cloud('', 'system', 'hello');
  global.fetch = originalFetch;
  assert.equal(result, null);
  assert.equal(called, false, 'no supabaseKey means zero network calls');
}

// --- 2. the RunPod tier is still a real step of the one chain ------------------------
// ONE ROUTER (2026-09-06): lib/ai.mjs no longer owns a waterfall of its own — the chain
// lives in lib/axon-router-core.mjs, so the end-to-end "free lane answers, paid lane is
// never touched" proof moved to tests/one-router-callers.test.mjs. What belongs here is
// that RunPod still sits in the locked default order, ahead of the paid lane.
{
  assert.ok(
    DEFAULT_LLM_CHAIN.includes('runpod'),
    'RunPod must still be a tier of the locked chain',
  );
  assert.ok(
    DEFAULT_LLM_CHAIN.indexOf('runpod') < DEFAULT_LLM_CHAIN.indexOf('anthropic'),
    'RunPod must stay ahead of the paid lane',
  );
  assert.equal(DEFAULT_LLM_CHAIN[0], 'local', 'the free local lane is still tried first');
}

console.log('runpod-tier.test.mjs OK');
