/**
 * DB-write path coverage for .claude/hooks/nvg-close.mjs's writeToBrain() — the actual
 * Supabase inserts/patches that test-nvg-close-rows.mjs's buildRows() tests (pure logic
 * only) never exercise. Mocks global.fetch so no real network call happens.
 * Filed against AXON-228-DBWRITE-TEST-COVERAGE-GAP-0917.
 * Run with: node --test scripts/test-nvg-close-dbwrite.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { buildRows, writeToBrain } = await import('../.claude/hooks/nvg-close.mjs');

const BASE = {
  agent: 'BUILD', workspace_type: 'build', task: 'fix the thing',
  deliverables: [], done_proof: [], worked: [], broke: ['X broke'], why: ['root cause'],
  fix: ['patched it'], tries: {}, regressed: [], instruction_change: [],
  carry_forward: [], resolved_siblings: [],
};

function mockFetch(calls, responder) {
  return async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    return responder(url, opts);
  };
}

test('writeToBrain: inserts apartment, one Learnings row per fix, and a heartbeat row', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', mockFetch(calls, (url) => (
    url.includes('nvg_run_heartbeats')
      ? { ok: true, json: async () => [{ id: 'hb-1' }] }
      : { ok: true, json: async () => [{ id: 'row-1' }] }
  )));

  const rows = buildRows(BASE);
  const out = await writeToBrain(BASE, rows);

  assert.equal(out.apartment, 'row-1');
  assert.equal(out.learnings.length, 1);
  assert.equal(out.heartbeat, 'hb-1');
  assert.equal(out.bus.length, 0);

  const tables = calls.map((c) => c.url.split('/rest/v1/')[1]);
  assert.deepEqual(tables, ['session_notes_apartment', 'Learnings', 'nvg_run_heartbeats']);
  assert.equal(calls[0].body[0].workspace_type, 'build');
  assert.ok(calls[1].body[0].learning.includes('patched it'));
});

test('writeToBrain: posts one agent_bus row per valid instruction_change', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', mockFetch(calls, () => ({ ok: true, json: async () => [{ id: 'x' }] })));

  const a = { ...BASE, instruction_change: [{ target: 'EXEC.md', change: 'add X', why: 'Y' }] };
  const rows = buildRows(a);
  const out = await writeToBrain(a, rows);

  assert.equal(out.bus.length, 1);
  const busCall = calls.find((c) => c.url.includes('agent_bus'));
  assert.equal(busCall.body[0].subject, 'INSTRUCTION-CHANGE: EXEC.md');
});

test('writeToBrain: a resolved_siblings PATCH failure is captured per-row, not thrown', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, opts) => (
    opts.method === 'PATCH'
      ? { ok: false, status: 500, text: async () => 'db error' }
      : { ok: true, json: async () => [{ id: 'x' }] }
  ));

  const a = { ...BASE, resolved_siblings: [{ id: '101', reason: 'same fix' }] };
  const rows = buildRows(a);
  const out = await writeToBrain(a, rows);

  assert.equal(out.resolved_siblings.length, 1);
  assert.equal(out.resolved_siblings[0].ok, false);
  assert.match(out.resolved_siblings[0].error, /HTTP 500/);
});

test('writeToBrain: sbInsert throws on a non-ok response, aborting the write chain', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => 'boom' }));
  const rows = buildRows(BASE);
  await assert.rejects(() => writeToBrain(BASE, rows), /HTTP 500/);
});
