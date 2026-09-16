#!/usr/bin/env node
/**
 * AX-RELAY-TIMEOUT-FIX-0828 followup (AXON PR #229) — council stress-test finding, fixed
 * here: the PR's own test suites never exercised the runtime path. node --check, a
 * standalone regex test, and a grep all confirmed the SOURCE reads `-m 120` /
 * `maxWaitMs: RELAY_LOCAL_MAX_WAIT_MS`, but nothing actually called executeLane() /
 * axonGenerate() and observed queueMiniShellJob() receive those values at runtime.
 *
 * This file does that, for BOTH changed call sites, including the retry path:
 *   1. executeLane()'s connectorKind==='local' branch (no retry).
 *   2. executeChainTier()'s tier==='local' branch (first attempt + its one retry).
 *
 * Two things are checked per site, from what the code actually does when run, not from
 * reading the source:
 *   a. The literal curl command captured off the real HTTP insert into nvg_mini_jobs
 *      contains "-m 120" (RELAY_LOCAL_CURL_TIMEOUT_S), not "-m 40".
 *   b. queueMiniShellJob's wait budget is really ~130s (RELAY_LOCAL_MAX_WAIT_MS), not the
 *      library's own 45s default (MINI_MAX_WAIT_MS) — proven by making the mocked mini job
 *      never complete and measuring how long the poll loop actually runs before giving up.
 *
 * (b) can't be observed over the network mock alone: maxWaitMs is a pure client-side poll
 * budget, never sent in any request. Real-time waiting 130s per case would make this test
 * unusably slow, so Date.now() and setTimeout are faked for the duration of this file only
 * (restored in a finally): setTimeout resolves immediately but advances a shared fake clock
 * by exactly the delay it was asked to wait, so the loop's own `while (Date.now() < deadline)`
 * math runs for real against a clock that advances in the same increments it would in
 * production — just without the wall-clock cost. This is the same shape as fake-timer
 * libraries (sinon/jest), hand-rolled here since Node's built-in mock.module() needs
 * --experimental-test-module-mocks and isn't guaranteed available across the Node versions
 * this repo runs test on (confirmed absent on the Node 22.22.2 used to write this file).
 *
 * Run: node tests/relay-timeout-runtime.test.mjs
 */
import assert from 'node:assert/strict';
import { executeLane, axonGenerate } from '../lib/axon-router-core.mjs';
import { MINI_MAX_WAIT_MS } from '../lib/nvg-mini-queue.mjs';

process.env.AXON_KEYSTORE_SECRET = process.env.AXON_KEYSTORE_SECRET || 'test-only-secret-do-not-use-in-prod';

// --- shared fake clock: real time never elapses, simulated time advances exactly as much
// as the code under test asks setTimeout to wait. ---
const originalSetTimeout = globalThis.setTimeout;
const originalDateNow = Date.now;
let fakeNow;

function installFakeClock() {
  fakeNow = originalDateNow();
  Date.now = () => fakeNow;
  globalThis.setTimeout = (fn, ms = 0) => {
    fakeNow += ms;
    return originalSetTimeout(fn, 0);
  };
}
function restoreClock() {
  Date.now = originalDateNow;
  globalThis.setTimeout = originalSetTimeout;
}

function json(data) {
  return { ok: true, status: 200, json: async () => data };
}
const originalFetch = globalThis.fetch;

/**
 * A mini-jobs mock that captures every insert's cmd and NEVER reports the job done —
 * every poll returns status:'queued', so queueMiniShellJob is forced to run its poll loop
 * all the way to its own deadline (proving what that deadline actually was) instead of
 * returning early on a fabricated "done" response.
 */
function makeNeverDoneMiniFetch(capturedCmds) {
  let jobSeq = 0;
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/nvg_mini_jobs') && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      // The SAME table also receives kind:'relay_metric' rows from relay-metrics.mjs's
      // logRelayMetric() after each attempt (a different write entirely, with no
      // payload.cmd) — only a real kind:'shell' job insert is what this test cares about.
      if (body.kind !== 'shell') return json([{ id: `metric-${++jobSeq}` }]);
      capturedCmds.push(body.payload.cmd);
      return json([{ id: `job-${capturedCmds.length}` }]);
    }
    if (u.includes('/rest/v1/nvg_mini_jobs') && (!opts.method || opts.method === 'GET')) {
      return json([{ status: 'queued', result: null, error: null }]);
    }
    throw new Error(`unmocked fetch in relay-timeout-runtime test: ${u}`);
  };
}

async function withFakeClockAndFetch(fetchImpl, fn) {
  installFakeClock();
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    restoreClock();
    globalThis.fetch = originalFetch;
  }
}

// A 45s-default timeout gives up well under 50000ms of simulated time; a real 130s budget
// must clear at least 125000ms (allowing one poll interval of slack either side).
const OLD_DEFAULT_CEILING_MS = 50_000;
const NEW_BUDGET_FLOOR_MS = 125_000;

// --- 1. executeLane(), connectorKind==='local' — no retry ---------------------------
await withFakeClockAndFetch(makeNeverDoneMiniFetch([]), async () => {
  const capturedCmds = [];
  globalThis.fetch = makeNeverDoneMiniFetch(capturedCmds);

  const lane = {
    connectorKind: 'local',
    model: 'axon-ornith',
    route: { base_url: 'http://localhost:11434' },
  };
  const start = Date.now();
  await assert.rejects(
    () => executeLane('fake-key', lane, [{ role: 'user', content: 'hi' }], {}),
    /local lane: no response from the mini/,
  );
  const elapsed = Date.now() - start;

  assert.equal(capturedCmds.length, 1, 'executeLane local lane should insert exactly one mini job');
  assert.match(capturedCmds[0], /-m 120 /, 'executeLane local lane must send curl -m 120, not -m 40');
  assert.ok(
    elapsed >= NEW_BUDGET_FLOOR_MS,
    `executeLane local lane gave up after only ${elapsed}ms of simulated time — expected it to run the poll loop out to ~130000ms (RELAY_LOCAL_MAX_WAIT_MS), not the library's ${MINI_MAX_WAIT_MS}ms default`,
  );
  assert.ok(
    elapsed > OLD_DEFAULT_CEILING_MS,
    `executeLane local lane's wait budget (${elapsed}ms simulated) is not distinguishable from the old ${MINI_MAX_WAIT_MS}ms default — the maxWaitMs override may not be reaching queueMiniShellJob`,
  );
});
console.log(`ok - executeLane local lane sends -m 120 and waits out a ~130s budget (not ${MINI_MAX_WAIT_MS}ms default)`);

// --- 2. executeChainTier(), tier==='local', via axonGenerate() — first attempt + retry ---
const ROUTE_LOCAL = { id: 'route-local', name: 'ollama-local', base_url: 'http://localhost:11434', secret_key: null, enabled: true };
const MODEL_LOCAL = { id: 'model-local', model: 'axon-ornith', enabled: true, cost_tier: 0, priority: 1 };

function makeChainFetch(capturedCmds) {
  const miniFetch = makeNeverDoneMiniFetch(capturedCmds);
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/axon_llm_chain')) {
      return json([{ tier: 'local', position: 0, enabled: true }]);
    }
    if (u.includes('/rest/v1/router_routes')) return json([ROUTE_LOCAL]);
    if (u.includes('/rest/v1/router_models')) return json([MODEL_LOCAL]);
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
    if (u.includes('/rest/v1/ni_platform_secrets')) return json([]);
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('/rest/v1/router_health')) return json([]);
    if (u.includes('/rest/v1/nvg_mini_jobs')) return miniFetch(u, opts);
    throw new Error(`unmocked fetch in relay-timeout-runtime chain test: ${u}`);
  };
}

await withFakeClockAndFetch(makeChainFetch([]), async () => {
  const capturedCmds = [];
  globalThis.fetch = makeChainFetch(capturedCmds);

  const start = Date.now();
  // Every tier failed (local is the only configured tier and it never completes) —
  // axonGenerate's contract is to throw once the whole chain is exhausted.
  await assert.rejects(
    () => axonGenerate('fake-key', { accountId: 'acct-1', messages: [{ role: 'user', content: 'hi' }] }),
    /every tier in the chain failed/,
  );
  const elapsed = Date.now() - start;

  assert.equal(capturedCmds.length, 2, 'executeChainTier local tier should try twice: first attempt + its one retry');
  for (const [i, cmd] of capturedCmds.entries()) {
    assert.match(cmd, /-m 120 /, `chain local tier attempt ${i + 1} must send curl -m 120, not -m 40`);
  }
  // Both attempts each run their own ~130s poll loop, plus a small fixed retry backoff
  // between them — total simulated time must clear roughly two old-default timeouts to
  // prove BOTH the first attempt and the retry got the new budget, not just one of them.
  assert.ok(
    elapsed >= NEW_BUDGET_FLOOR_MS * 2,
    `chain local tier's two attempts together only ran ${elapsed}ms of simulated time — expected roughly 2x130000ms if both the first attempt and its retry each got the ~130s budget`,
  );
});
console.log('ok - executeChainTier local tier sends -m 120 on both the first attempt and its retry, each waiting out a ~130s budget');

console.log('relay-timeout-runtime.test.mjs: all assertions passed');
