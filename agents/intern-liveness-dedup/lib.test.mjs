import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureFor, analyze } from './lib.mjs';

test('signatureFor extracts trigger id + alert suffix', () => {
  const sig = signatureFor({
    code: 'LOOP-LIVE-trig_01FW1Z8njCLotxtwzVDo5g2x-NEXT-RUN-IN-PAST',
  });
  assert.equal(sig, 'trig_01FW1Z8njCLotxtwzVDo5g2x::NEXT-RUN-IN-PAST');
});

test('signatureFor handles non-trig source ids (heartbeat/queue names)', () => {
  const sig = signatureFor({ code: 'LIVE-vault_writeback_queue-LATE' });
  assert.equal(sig, 'vault_writeback_queue::LATE');
});

test('analyze finds no duplicates when every signature is unique', () => {
  const rows = [
    { id: '1', code: 'LIVE-trig_aaa-LATE', created_at: '2026-08-14T00:00:00Z' },
    { id: '2', code: 'LIVE-trig_bbb-LATE', created_at: '2026-08-14T00:05:00Z' },
  ];
  const report = analyze(rows);
  assert.equal(report.duplicate_groups, 0);
  assert.equal(report.duplicate_row_count, 0);
  assert.equal(report.scanned, 2);
});

test('analyze collapses repeats of the same trigger+alert into one group, keeps earliest as canonical', () => {
  const rows = [
    { id: 'later', code: 'LOOP-LIVE-trig_x-NOT-ENABLED', created_at: '2026-08-16T20:40:00Z' },
    { id: 'earliest', code: 'LOOP-LIVE-trig_x-NOT-ENABLED', created_at: '2026-08-14T10:40:00Z' },
    { id: 'unrelated', code: 'LOOP-LIVE-trig_y-NOT-ENABLED', created_at: '2026-08-14T10:40:00Z' },
  ];
  const report = analyze(rows);
  assert.equal(report.duplicate_groups, 1);
  assert.equal(report.duplicate_row_count, 1);
  const group = report.groups[0];
  assert.equal(group.canonical_id, 'earliest');
  assert.deepEqual(group.duplicate_ids, ['later']);
  assert.equal(group.count, 2);
});

test('analyze sorts duplicate groups largest-cluster-first', () => {
  const rows = [
    { id: 'a1', code: 'LIVE-trig_a-LATE', created_at: '2026-08-14T00:00:00Z' },
    { id: 'a2', code: 'LIVE-trig_a-LATE', created_at: '2026-08-14T01:00:00Z' },
    { id: 'b1', code: 'LIVE-trig_b-LATE', created_at: '2026-08-14T00:00:00Z' },
    { id: 'b2', code: 'LIVE-trig_b-LATE', created_at: '2026-08-14T01:00:00Z' },
    { id: 'b3', code: 'LIVE-trig_b-LATE', created_at: '2026-08-14T02:00:00Z' },
  ];
  const report = analyze(rows);
  assert.equal(report.groups[0].signature, 'trig_b::LATE');
  assert.equal(report.groups[0].count, 3);
});

test('analyze skips malformed rows without a code instead of throwing', () => {
  const rows = [
    { id: '1', created_at: '2026-08-14T00:00:00Z' },
    { id: '2', code: 'LIVE-trig_a-LATE', created_at: '2026-08-14T00:00:00Z' },
  ];
  assert.doesNotThrow(() => analyze(rows));
});
