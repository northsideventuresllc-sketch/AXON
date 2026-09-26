/**
 * Tests for .claude/hooks/nvg-close.mjs's buildRows() — specifically that
 * resolved_siblings (hook 2, BUILD-MECHANICAL-TICKETS-FIRST-HOOKS-0907) survives into
 * the row bundle so the no-brain-key fallback path (queue + print) never silently drops
 * it. Pure-logic only. Run with: node --test scripts/test-nvg-close-rows.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

test('buildRows: equal-length broke/why/fix zip index-by-index (the caller-asserted pairing)', () => {
  const rows = buildRows({ ...BASE, broke: ['X broke'], why: ['root cause of X'], fix: ['patched X'], resolved_siblings: [] });
  assert.equal(rows.learnings.length, 1);
  assert.ok(rows.learnings[0].learning.includes('X broke — why: root cause of X — fix now in place: patched X'));
});

test('buildRows (AX-CLOSE-HOOK-FABRICATES-CAUSATION-0917): mismatched broke/why/fix lengths never fabricate a pairing', () => {
  const rows = buildRows({ ...BASE, broke: ['symptom A', 'symptom B'], why: ['real cause of A'], fix: ['fix 1', 'fix 2', 'fix 3'], resolved_siblings: [] });
  const joined = rows.learnings.map((l) => l.learning).join('\n');
  // must never claim "real cause of A" is the why for symptom B, fix 2, or fix 3
  assert.ok(!joined.includes('symptom B — why: real cause of A'));
  assert.ok(!joined.includes('fix now in place: fix 2') && !joined.includes('fix now in place: fix 3'));
  // the three lists still land, just unlinked
  assert.ok(joined.includes('broke — symptom A | symptom B'));
  assert.ok(joined.includes('root causes observed — real cause of A'));
  assert.ok(joined.includes('fixes applied — fix 1 | fix 2 | fix 3'));
});

test('AX-CLOSE-HOOK-SILENT-NOOP-ON-SPACES-0917: the CLI entry guard actually runs main() from a path containing a space', () => {
  // `file://${process.argv[1]}` never matched import.meta.url on a space-containing path
  // (Node percent-encodes the URL but not argv[1]) -- main() silently never ran, exit 0,
  // zero output, zero writes. Reproduce the exact shape: copy the hook + its dependency
  // into a temp dir whose name has a space, invoke it as a real CLI subprocess, and prove
  // it actually produces output instead of running silent.
  // realpathSync matters here: os.tmpdir() on macOS is /tmp, itself a symlink to
  // /private/tmp -- import.meta.url resolves through the symlink but a naive
  // pathToFileURL(process.argv[1]) would not, which is an unrelated confound, not
  // the space-encoding bug this test targets. Resolve first so the only variable is the space.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nvg close test ')));
  const hookSrc = fs.readFileSync(new URL('../.claude/hooks/nvg-close.mjs', import.meta.url), 'utf8');
  const sweepSrc = fs.readFileSync(new URL('../.claude/hooks/nvg-resolution-sweep.mjs', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(dir, 'nvg-close.mjs'), hookSrc);
  fs.writeFileSync(path.join(dir, 'nvg-resolution-sweep.mjs'), sweepSrc);
  const payload = path.join(dir, 'payload.json');
  fs.writeFileSync(payload, JSON.stringify({ ...BASE, resolved_siblings: [] }));

  try {
    const out = execFileSync(process.execPath, [path.join(dir, 'nvg-close.mjs'), '--file', payload], { encoding: 'utf8', cwd: dir, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SERVICE_KEY: '' } });
    assert.ok(out.length > 0, 'main() must produce output even from a space-containing path');
    assert.ok(fs.existsSync(path.join(dir, '.nvg', 'closeout.ok')), 'main() must write .nvg/closeout.ok even from a space-containing path');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AX-CLOSE-HOOK-SILENT-NOOP-ON-SPACES-0917: still runs main() when invoked through a symlink into the space-containing path (the documented ~/nv-vault case)', () => {
  // import.meta.url resolves through symlinks (realpath); a naive pathToFileURL(process.argv[1])
  // does not. AGENTS.md documents ~/nv-vault as a valid no-space symlink pointing at the real,
  // space-containing vault directory -- exactly this shape. Without realpathSync on argv[1] too,
  // the guard silently no-ops again here, just for a different reason than the plain space case.
  const realDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nvg close symlink target ')));
  const linkDir = path.join(os.tmpdir(), `nvg-close-symlink-${process.pid}-${Math.floor(Math.random() * 1e6)}`);
  fs.symlinkSync(realDir, linkDir, 'dir');
  const hookSrc = fs.readFileSync(new URL('../.claude/hooks/nvg-close.mjs', import.meta.url), 'utf8');
  const sweepSrc = fs.readFileSync(new URL('../.claude/hooks/nvg-resolution-sweep.mjs', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(realDir, 'nvg-close.mjs'), hookSrc);
  fs.writeFileSync(path.join(realDir, 'nvg-resolution-sweep.mjs'), sweepSrc);
  const payload = path.join(realDir, 'payload.json');
  fs.writeFileSync(payload, JSON.stringify({ ...BASE, resolved_siblings: [] }));

  try {
    // invoke via the no-space symlink path, not the real (space-containing) path
    const out = execFileSync(process.execPath, [path.join(linkDir, 'nvg-close.mjs'), '--file', payload], { encoding: 'utf8', cwd: linkDir, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SERVICE_KEY: '' } });
    assert.ok(out.length > 0, 'main() must produce output even when invoked via a symlink into a space-containing path');
    assert.ok(fs.existsSync(path.join(realDir, '.nvg', 'closeout.ok')), 'main() must write .nvg/closeout.ok even when invoked via a symlink');
  } finally {
    fs.rmSync(linkDir, { force: true });
    fs.rmSync(realDir, { recursive: true, force: true });
  }
});


test('LRNB-DELIVERABLES-OBJECT-TOSTRING-0925: an object deliverable renders as "title — proof", never "[object Object]"', () => {
  const rows = buildRows({ ...BASE, deliverables: [{ title: 'PR merged', proof: 'https://example.com/pr/1' }] });
  assert.ok(rows.apartment.raw_note.includes('DELIVERABLES: PR merged — https://example.com/pr/1'));
  assert.ok(!rows.apartment.raw_note.includes('[object Object]'));
});

test('LRNB-DELIVERABLES-OBJECT-TOSTRING-0925: a mix of strings and objects all render as readable text, joined by " | "', () => {
  const rows = buildRows({ ...BASE, deliverables: ['plain string deliverable', { title: 'fixed the bug', proof: 'commit abc123' }] });
  assert.ok(rows.apartment.raw_note.includes('DELIVERABLES: plain string deliverable | fixed the bug — commit abc123'));
});

test('LRNB-DELIVERABLES-OBJECT-TOSTRING-0925: a nested array deliverable flattens to readable text', () => {
  const rows = buildRows({ ...BASE, deliverables: [['sub-item A', 'sub-item B']] });
  assert.ok(rows.apartment.raw_note.includes('DELIVERABLES: sub-item A, sub-item B'));
});

test('LRNB-DELIVERABLES-OBJECT-TOSTRING-0925: an object with no title/proof shape falls back to its own values, never "[object Object]"', () => {
  const rows = buildRows({ ...BASE, deliverables: [{ what: 'weird shape', status: 'done' }] });
  assert.ok(!rows.apartment.raw_note.includes('[object Object]'));
  assert.ok(rows.apartment.raw_note.includes('weird shape'));
});
