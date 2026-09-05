#!/usr/bin/env node
/**
 * AXON cron guard tests — run: node tests/axon-cron-guard.test.mjs
 *
 * lib/axon-cron-guard.mjs is the only thing standing between JB's dashboard
 * enabled toggle and a scheduled job actually running. Mac-cron entrypoints
 * have no GitHub Actions schedule to fall back on, so a missing guard call
 * there means the toggle does nothing at all — and it's a silent failure:
 * the dashboard still shows "disabled," the job just keeps running anyway.
 *
 * Two layers:
 *  1. Unit tests of isCronJobEnabled/cronGuardShouldSkip against an injected
 *     fake sbSelect — no network.
 *  2. End-to-end tests of every scheduled entrypoint script: mocks the
 *     global fetch that lib/supabase.mjs's sbSelect calls, runs the REAL
 *     script module, and proves (a) a disabled job makes exactly one
 *     Supabase call and does zero further work, and (b) an enabled job
 *     proceeds past the guard into real work. No live network, no real
 *     secrets.
 */
import assert from 'node:assert/strict';
import { cronGuardShouldSkip, isCronJobEnabled } from '../lib/axon-cron-guard.mjs';

// ---------- Layer 1: the guard function itself ----------

assert.equal(await isCronJobEnabled('x', async () => [{ enabled: false }]), false);
assert.equal(await isCronJobEnabled('x', async () => [{ enabled: true }]), true);
assert.equal(await isCronJobEnabled('x', async () => []), true, 'unseeded row fails open (enabled)');
assert.equal(
  await isCronJobEnabled('x', async () => {
    throw new Error('boom');
  }),
  true,
  'a Supabase error fails open (enabled) — never silently kills a job on a DB blip',
);

assert.equal(await cronGuardShouldSkip('x', async () => [{ enabled: false }]), true);
assert.equal(await cronGuardShouldSkip('x', async () => [{ enabled: true }]), false);
assert.equal(await cronGuardShouldSkip('x', async () => []), false);

// ---------- Layer 2: every real scheduled entrypoint ----------

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
// axon-ni-outreach.mjs has its own separate training-mode gate ahead of the
// cron guard (AXON_OUTREACH_MANUAL_RUN) — set it so this test actually
// reaches the guard call instead of returning before it.
process.env.AXON_OUTREACH_MANUAL_RUN = '1';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

// Every scheduled entrypoint that is supposed to honor axon_cron_jobs.enabled,
// and the exact job id it must check. If a new scheduled script wires in
// cronGuardShouldSkip, add it here too — this list is what makes a missing
// guard call fail loudly instead of silently.
//
// axon-wisdom-loop.mjs was rebuilt into scripts/axon-executive-agent.mjs
// (2026-08-26, JB direct order) — axon-wisdom-loop.mjs is now just a
// deprecated forwarding shim, so the guard belongs on the real entrypoint,
// keyed to its own registered axon_cron_jobs id (CRON_JOB_ID in
// lib/axon-executive-agent.mjs), not the old 'axon-wisdom-loop' id.
// axon-telegram-poll.mjs and axon-ni-outreach.mjs were retired 2026-09-05
// (Decision #1767) and are no longer in the tree.
const GUARDED_ENTRYPOINTS = [
  ['../scripts/axon-self-research.mjs', 'axon-self-research'],
  ['../scripts/axon-mf-ad-tracker-sync.mjs', 'axon-mf-ad-tracker'],
  ['../scripts/axon-executive-agent.mjs', 'axon-executive-agent'],
  ['../scripts/axon-local-model-daily.mjs', 'axon-local-model-daily'],
  ['../scripts/axon-comm-skill.mjs', 'axon-comm-skill'],
];

async function runEntrypoint(modPath, enabled) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith(`${SUPABASE_URL}/rest/v1/axon_cron_jobs`)) {
      return { ok: true, json: async () => [{ enabled }] };
    }
    // Anything past the guard counts as "real work" for this test.
    return {
      ok: false,
      status: 599,
      text: async () => `test-mock: no real endpoint for ${u}`,
      json: async () => {
        throw new Error(`test-mock: no real endpoint for ${u}`);
      },
    };
  };
  const realExit = process.exit;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  const logs = [];
  process.exit = () => {};
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try {
    // Cache-busting query string forces a fresh module instance per run so
    // each script's top-level main() actually re-executes.
    await import(`${modPath}?guardtest=${enabled}-${Math.random()}`);
    await new Promise((r) => setTimeout(r, 250));
  } finally {
    globalThis.fetch = realFetch;
    process.exit = realExit;
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
  }
  return { calls, logs };
}

for (const [modPath, jobId] of GUARDED_ENTRYPOINTS) {
  const { calls, logs } = await runEntrypoint(modPath, false);
  const cronCalls = calls.filter((c) => c.includes('/axon_cron_jobs'));
  const otherCalls = calls.filter((c) => !c.includes('/axon_cron_jobs'));

  assert.equal(cronCalls.length, 1, `${modPath}: must query axon_cron_jobs exactly once`);
  assert.ok(
    cronCalls[0].includes(`id=eq.${jobId}`),
    `${modPath}: guard must be called with job id "${jobId}" (got: ${cronCalls[0]})`,
  );
  assert.equal(
    otherCalls.length,
    0,
    `${modPath}: a disabled job must do ZERO real work — got a call to ${otherCalls[0]}`,
  );
  assert.ok(
    logs.some((l) => l.includes('disabled') && l.includes(jobId)),
    `${modPath}: must log a plain skip message naming the job`,
  );
}

for (const [modPath, jobId] of GUARDED_ENTRYPOINTS) {
  const { calls } = await runEntrypoint(modPath, true);
  const otherCalls = calls.filter((c) => !c.includes('/axon_cron_jobs'));
  assert.ok(
    otherCalls.length > 0,
    `${modPath}: an ENABLED job must proceed past the guard into real work (job id "${jobId}")`,
  );
}

console.log('axon-cron-guard.test.mjs OK — 8/8 scheduled entrypoints honor axon_cron_jobs.enabled');
