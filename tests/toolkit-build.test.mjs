#!/usr/bin/env node
/**
 * AXON Toolkit Build (item #10) — proves two things:
 *   1. buildToolkitTask() turns a drafted widget spec into a task string that actually
 *      carries the spec's content (name, summary, fields) — a Build Manager receiving it
 *      has something real to act on, not an empty hand-off.
 *   2. requestToolkitBuild() genuinely re-checks the FIRE/HOLD gate under its own action
 *      id BEFORE ever reaching fireAgent()/Supabase — with no SUPABASE_SERVICE_KEY and no
 *      AXON_FIRE_MODE override, the gate must fail safe to HOLD and refuse the build,
 *      never fall through to "no key configured" as if the gate check had been skipped.
 *      This is the regression this file is written to catch: delete the gate check and a
 *      HOLD-mode build would still get refused (no key), but for the WRONG reason — this
 *      test asserts `held: true` specifically, not just `ok: false`.
 *
 * No network calls: SUPABASE_SERVICE_KEY and AXON_FIRE_MODE are left unset so
 * getFireMode() resolves to the 'default' HOLD branch without ever calling fetch.
 *
 * Run: node tests/toolkit-build.test.mjs
 */
import assert from 'node:assert/strict';
import { buildToolkitTask, requestToolkitBuild } from '../lib/axon-toolkit-build.mjs';

delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.AXON_FIRE_MODE;

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('buildToolkitTask (pure):');

check('carries the widget name', () => {
  const task = buildToolkitTask({ name: 'Outreach Replies Waiting', summary: '', fields: [] });
  assert.match(task, /"Outreach Replies Waiting"/);
});

check('carries the summary when present', () => {
  const task = buildToolkitTask({ name: 'X', summary: 'shows recent replies', fields: [] });
  assert.match(task, /shows recent replies/);
});

check('omits a summary line when summary is blank', () => {
  const task = buildToolkitTask({ name: 'X', summary: '  ', fields: [] });
  assert.doesNotMatch(task, /What it should show:/);
});

check('lists each drafted field on its own bullet', () => {
  const task = buildToolkitTask({ name: 'X', summary: '', fields: ['A headline number', 'A status indicator'] });
  assert.match(task, /- A headline number/);
  assert.match(task, /- A status indicator/);
});

check('falls back to a name when none is given', () => {
  const task = buildToolkitTask({});
  assert.match(task, /"Untitled widget"/);
});

check('always tells the target to respect the FIRE\\/HOLD gate', () => {
  const task = buildToolkitTask({ name: 'X' });
  assert.match(task, /FIRE\/HOLD gate/);
});

console.log('requestToolkitBuild (gate + validation, offline):');

await checkAsync('refuses with no spec name', async () => {
  const result = await requestToolkitBuild({ spec: {}, toAgentId: 'agent-1' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /spec/i);
});

await checkAsync('refuses with no target agent', async () => {
  const result = await requestToolkitBuild({ spec: { name: 'X' }, toAgentId: '' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Build Manager/i);
});

await checkAsync('fails safe to HOLD when the gate cannot be resolved live', async () => {
  const result = await requestToolkitBuild({ spec: { name: 'X' }, toAgentId: 'agent-1' });
  assert.equal(result.ok, false);
  assert.equal(result.held, true, 'expected held:true — a HOLD refusal must be distinguishable from every other failure');
  assert.match(result.reason, /HOLD/);
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error('SOME CHECKS FAILED');
  process.exit(1);
}
