#!/usr/bin/env node
/**
 * AX-RUNPOD-ZERO-SUCCESS-0915 — proves the fixed RunPod (AXON v1) request contract at
 * runtime, not by inspection. Live diagnosis this session (2026-09-16, first environment
 * to actually reach api.runpod.ai with the real key) found the old code POSTed a flat
 * `{model, prompt, stream}` body straight to the base endpoint URL, which RunPod answers
 * with an instant 404 — never RunPod's real contract of POST `${endpoint}/run` with a
 * `{"input": {...}}`-wrapped body, then poll `${endpoint}/status/{id}`.
 *
 * This file proves, against a mocked RunPod API (not the real one — the real one is
 * live-confirmed wedged, see the ticket, so a real success can't be demonstrated right
 * now), that the fixed client:
 *   1. submits to `${endpoint}/run` with the wrapped input shape,
 *   2. returns immediately on a same-call COMPLETED (RunPod does this for fast jobs),
 *   3. otherwise polls `${endpoint}/status/{id}` until COMPLETED and extracts the text,
 *   4. cancels the job via `${endpoint}/cancel/{id}` if the poll budget is exhausted
 *      (the old code never did this — live-diagnosed as the cause of a 25+ job orphan
 *      backlog on the real endpoint this session found stuck IN_QUEUE).
 *
 * Run: node tests/runpod-relay-contract.test.mjs
 */
import assert from 'node:assert/strict';
import { callAxonV1Cloud } from '../lib/axon-v1-cloud-relay.mjs';

function json(data, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data };
}
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalDateNow = Date.now;

function withSecrets(handler) {
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('ni_platform_secrets')) {
      if (u.includes('RUNPOD_AXON_V1_ENDPOINT')) return json([{ value: 'https://api.runpod.ai/v2/fake-endpoint' }]);
      if (u.includes('RUNPOD_AXON_V1_KEY')) return json([{ value: 'fake-runpod-key' }]);
      return json([]);
    }
    if (u.includes('relay_metrics') || u.includes('nvg_mini_jobs')) return json([{ id: 'metric-1' }]);
    return handler(u, opts);
  };
}

// --- 1. submit shape: /run + wrapped input, not the base URL with a flat body ---------
{
  let capturedUrl = null;
  let capturedBody = null;
  globalThis.fetch = withSecrets(async (u, opts) => {
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/run') {
      capturedUrl = u;
      capturedBody = JSON.parse(opts.body);
      return json({ id: 'job-1', status: 'COMPLETED', output: [{ choices: [{ text: 'hi there' }] }] });
    }
    throw new Error(`unmocked fetch: ${u}`);
  });

  const text = await callAxonV1Cloud('fake-key', 'system', 'hello');
  globalThis.fetch = originalFetch;

  assert.equal(capturedUrl, 'https://api.runpod.ai/v2/fake-endpoint/run', 'must POST to /run, not the base endpoint URL');
  assert.ok(capturedBody?.input, 'body must be wrapped as {"input": {...}}, not a flat {model,prompt,stream} body');
  assert.equal(typeof capturedBody.input.prompt, 'string', 'the prompt must live under input.prompt');
  assert.equal(text, 'hi there', 'a same-call COMPLETED response must return the extracted text immediately');
}
console.log('ok - submits to /run with {"input":{...}}, extracts text on immediate COMPLETED');

// --- 2. polling path: IN_QUEUE -> COMPLETED via /status/{id} --------------------------
{
  let pollCount = 0;
  globalThis.fetch = withSecrets(async (u, opts) => {
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/run') {
      return json({ id: 'job-2', status: 'IN_QUEUE' });
    }
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/status/job-2') {
      pollCount += 1;
      if (pollCount < 3) return json({ id: 'job-2', status: 'IN_QUEUE' });
      return json({ id: 'job-2', status: 'COMPLETED', output: { text: 'polled result' } });
    }
    throw new Error(`unmocked fetch: ${u}`);
  });
  globalThis.setTimeout = (fn, _ms = 0) => originalSetTimeout(fn, 0); // don't actually wait real time between polls

  const text = await callAxonV1Cloud('fake-key', 'system', 'hello');
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;

  assert.ok(pollCount >= 3, 'must poll /status/{id} until the job leaves IN_QUEUE');
  assert.equal(text, 'polled result', 'must extract text from the completed poll response');
}
console.log('ok - polls /status/{id} until COMPLETED and extracts the result');

// --- 3. timeout path: poll budget exhausted -> job is cancelled, caller gets null -----
{
  let fakeNow;
  let cancelledJobId = null;
  Date.now = () => fakeNow;
  globalThis.setTimeout = (fn, ms = 0) => {
    fakeNow += ms;
    return originalSetTimeout(fn, 0);
  };
  fakeNow = originalDateNow();

  globalThis.fetch = withSecrets(async (u) => {
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/run') {
      return json({ id: 'job-3', status: 'IN_QUEUE' });
    }
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/status/job-3') {
      return json({ id: 'job-3', status: 'IN_QUEUE' }); // never completes — exactly what the real endpoint does today
    }
    if (u === 'https://api.runpod.ai/v2/fake-endpoint/cancel/job-3') {
      cancelledJobId = 'job-3';
      return json({ id: 'job-3', status: 'CANCELLED' });
    }
    throw new Error(`unmocked fetch: ${u}`);
  });

  const text = await callAxonV1Cloud('fake-key', 'system', 'hello');
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  Date.now = originalDateNow;

  assert.equal(text, null, 'a job stuck IN_QUEUE past the poll budget must fall through to null, not hang forever');
  assert.equal(
    cancelledJobId,
    'job-3',
    'a timed-out job must be cancelled via /cancel/{id} — the old code left these as permanent orphans (25+ found live this session)',
  );
}
console.log('ok - a job stuck past the poll budget is cancelled, not left as a permanent orphan');

console.log('runpod-relay-contract.test.mjs: all assertions passed');
