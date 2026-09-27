#!/usr/bin/env node
/**
 * axon-airllm-bench pure-function tests — run: node --test tests/axon-airllm-bench.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDfFreeGb,
  getFreeDiskGb,
  buildComparisonReport,
  DEFAULT_MIN_FREE_GB,
} from '../scripts/axon-airllm-bench.mjs';

test('parseDfFreeGb reads the Avail column from macOS df -h output', () => {
  const out = 'Filesystem      Size   Used  Avail Capacity iused ifree %iused  Mounted on\n/dev/disk3s1   494Gi  480Gi  8.6Gi    99%  123456 456789    21%   /';
  assert.ok(Math.abs(parseDfFreeGb(out) - 8.6) < 0.01);
});

test('parseDfFreeGb handles a plain G suffix (no i)', () => {
  const out = 'Filesystem Size Used Avail Capacity Mounted-on\n/dev/x 100G 90G 10G 90% /';
  assert.ok(Math.abs(parseDfFreeGb(out) - 10) < 0.01);
});

test('parseDfFreeGb returns NaN on unparsable input', () => {
  assert.ok(Number.isNaN(parseDfFreeGb('garbage')));
});

test('getFreeDiskGb returns 0 (not "unknown = proceed") if the shell call throws', async () => {
  const gb = await getFreeDiskGb({
    execFileImpl: async () => {
      throw new Error('df not found');
    },
  });
  assert.equal(gb, 0);
});

test('DEFAULT_MIN_FREE_GB is a sane positive floor', () => {
  assert.ok(DEFAULT_MIN_FREE_GB > 0);
});

test('buildComparisonReport: airllm faster produces the airllm-faster verdict', () => {
  const report = buildComparisonReport({
    model: 'test-model',
    minFreeGb: 6,
    freeDiskGbAtStart: 10,
    airllm: [{ ok: true, ms: 500 }, { ok: true, ms: 700 }],
    claudeCli: [{ ok: true, ms: 1200 }, { ok: true, ms: 1300 }],
  });
  assert.match(report.verdict, /AirLLM local .* is faster/);
  assert.equal(report.airllm.avg_ms, 600);
  assert.equal(report.claude_subscription_cli.avg_ms, 1250);
});

test('buildComparisonReport: all-failed side yields an incomplete verdict, never a false comparison', () => {
  const report = buildComparisonReport({
    model: 'test-model',
    minFreeGb: 6,
    freeDiskGbAtStart: 10,
    airllm: [{ ok: false, ms: 100, error: 'oom' }],
    claudeCli: [{ ok: true, ms: 900 }],
  });
  assert.match(report.verdict, /incomplete/);
});
