/**
 * Tests for .claude/hooks/nvg-close.mjs's buildRows() — specifically that
 * resolved_siblings (hook 2, BUILD-MECHANICAL-TICKETS-FIRST-HOOKS-0907) survives into
 * the row bundle so the no-brain-key fallback path (queue + print) never silently drops
 * it. Pure-logic only. Run with: node --test scripts/test-nvg-close-rows.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows } from '../.claude/hooks/nvg-close.mjs';

const BASE = {
  agent: 'BUILD', workspace_type: 'build', task: 'fix the thing',
  deliverables: [], done_proof: [], worked: [], broke: [], why: [], fix: [],
  tries: {}, regressed: [], instruction_change: [], carry_forward: [],
};

test('buildRows: resolved_siblings passes through into the row bundle', () => {
  const rows = buildRows({ ...BASE, resolved_siblings: [{ id: '101', reason: 'same fix' }] });
  assert.deepEqual(rows.resolved_siblings, [{ id: '101', reason: 'same fix' }]);
});

test('buildRows: no resolved_siblings on input -> present as-is on rows, not silently dropped', () => {
  const rows = buildRows({ ...BASE, resolved_siblings: [] });
  assert.deepEqual(rows.resolved_siblings, []);
});

test('buildRows: writes a heartbeat row keyed by agent, defaulting status to ok', () => {
  const rows = buildRows({ ...BASE, resolved_siblings: [] });
  assert.equal(rows.heartbeat.job_key, 'BUILD');
  assert.equal(rows.heartbeat.status, 'ok');
  assert.ok(rows.heartbeat.started_at);
  assert.ok(rows.heartbeat.finished_at);
});

test('buildRows: heartbeat status flips to ok_with_fixes when fix or regressed is non-empty', () => {
  const withFix = buildRows({ ...BASE, fix: ['patched the thing'], resolved_siblings: [] });
  assert.equal(withFix.heartbeat.status, 'ok_with_fixes');
  const withRegression = buildRows({ ...BASE, regressed: ['X broke'], resolved_siblings: [] });
  assert.equal(withRegression.heartbeat.status, 'ok_with_fixes');
});

test('buildRows: started_at passthrough, defaults to close-out time when omitted', () => {
  const rows = buildRows({ ...BASE, started_at: '2026-01-01T00:00:00.000Z', resolved_siblings: [] });
  assert.equal(rows.heartbeat.started_at, '2026-01-01T00:00:00.000Z');
});

test('buildRows: heartbeat carries a non-empty run_id (nvg_run_heartbeats.run_id is NOT NULL, no default)', () => {
  const a = buildRows({ ...BASE, resolved_siblings: [] });
  const b = buildRows({ ...BASE, resolved_siblings: [] });
  assert.ok(a.heartbeat.run_id && typeof a.heartbeat.run_id === 'string');
  assert.notEqual(a.heartbeat.run_id, b.heartbeat.run_id, 'two close-outs in the same run must not collide on run_id');
});

test('buildRows: a malformed instruction_change entry (no target/change) is dropped, never posted to the bus (TICKET NVG-WEEKEND-AGENT-BLANK-INSTRUCTION-CHANGE-0914)', () => {
  const rows = buildRows({ ...BASE, instruction_change: [{}], resolved_siblings: [] });
  assert.deepEqual(rows.bus, []);
  assert.ok(rows.apartment.raw_note.includes('INSTRUCTION CHANGES REQUESTED: 0 (1 malformed, dropped)'));
});

test('buildRows: a real instruction_change entry still posts normally, no "undefined" in the subject', () => {
  const rows = buildRows({ ...BASE, instruction_change: [{ target: 'EXEC.md', change: 'add X', why: 'Y' }], resolved_siblings: [] });
  assert.equal(rows.bus.length, 1);
  assert.equal(rows.bus[0].subject, 'INSTRUCTION-CHANGE: EXEC.md');
  assert.ok(!rows.bus[0].subject.includes('undefined'));
});

test('buildRows: a mix of one valid and one malformed entry keeps only the valid one', () => {
  const rows = buildRows({ ...BASE, instruction_change: [{ target: 'EXEC.md', change: 'add X', why: 'Y' }, { why: 'no target or change' }], resolved_siblings: [] });
  assert.equal(rows.bus.length, 1);
  assert.equal(rows.bus[0].body.target, 'EXEC.md');
});
