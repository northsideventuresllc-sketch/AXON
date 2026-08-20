#!/usr/bin/env node
/**
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order) — proves the new RunPod (AXON v1) tier:
 *   1. callAxonV1Cloud returns null immediately (no network POST attempted) when
 *      RUNPOD_AXON_V1_ENDPOINT / RUNPOD_AXON_V1_KEY are absent from ni_platform_secrets
 *      (the real state right now — RunPod isn't deployed yet).
 *   2. The full tier chain in lib/ai.mjs (callTiered, via haikuFollowUp) still falls
 *      through AXON-local -> RunPod -> Gemini and returns the Gemini result unchanged —
 *      i.e. this is a no-op on current behavior, not a regression.
 *
 * Run: node tests/runpod-tier.test.mjs
 */
import assert from 'node:assert/strict';
import { callAxonV1Cloud } from '../lib/axon-v1-cloud-relay.mjs';
import { haikuFollowUp } from '../lib/ai.mjs';

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

// --- 2. full callTiered() chain (via haikuFollowUp) still falls through to Gemini -----
{
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    calls.push(u);

    // AXON-local (nvg_mini_jobs insert) — simulate unreachable, forces fallthrough.
    if (u.includes('nvg_mini_jobs')) {
      return { ok: false, status: 500, json: async () => ({}) };
    }

    // RunPod tier secret lookups — absent, matches real current state.
    if (u.includes('ni_platform_secrets')) {
      return { ok: true, json: async () => [] };
    }

    // Gemini — succeeds, proving the chain still reaches and returns Gemini output.
    if (u.includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: JSON.stringify({ email_subject: 'Follow up', email_body: 'Still here.' }) },
                ],
              },
            },
          ],
        }),
      };
    }

    throw new Error(`unexpected fetch in chain test: ${u}`);
  };

  const cfg = {
    supabaseKey: 'fake-supabase-key',
    geminiKey: 'fake-gemini-key',
    geminiBackup: null,
    geminiModel: 'gemini-2.5-flash-lite',
    anthropicKey: 'unused-should-not-be-called',
  };
  const lead = { handle: 'Acme Freight', niche: 'freight', comment_draft: 'Saw your ops bottleneck…' };

  const draft = await haikuFollowUp(cfg, lead);
  global.fetch = originalFetch;

  assert.equal(draft.email_subject, 'Follow up');
  assert.equal(draft.email_body, 'Still here.');
  assert.ok(calls.some((u) => u.includes('nvg_mini_jobs')), 'AXON-local tier must have been attempted first');
  assert.ok(calls.some((u) => u.includes('ni_platform_secrets')), 'RunPod tier must have been attempted second');
  assert.ok(calls.some((u) => u.includes('generativelanguage.googleapis.com')), 'chain must reach Gemini');
  assert.ok(
    !calls.some((u) => u.includes('api.anthropic.com')),
    'must not fall all the way to Anthropic when Gemini succeeds — no regression from pre-RunPod behavior',
  );
}

console.log('runpod-tier.test.mjs OK');
