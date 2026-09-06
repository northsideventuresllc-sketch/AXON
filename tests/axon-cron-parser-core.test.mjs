#!/usr/bin/env node
/**
 * A9 — direct unit tests for the cron parser extracted out of
 * lib/axon-cron-jobs.ts into lib/axon-cron-parser-core.mjs (plain .mjs so
 * `node --test` can import it with no TS loader).
 * Run: node tests/axon-cron-parser-core.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateNextRunUtc, matchCronField } from '../lib/axon-cron-parser-core.mjs';

test('matchCronField: wildcard matches anything', () => {
  assert.equal(matchCronField('*', 0), true);
  assert.equal(matchCronField('*', 59), true);
});

test('matchCronField: step field (*/N)', () => {
  assert.equal(matchCronField('*/15', 0), true);
  assert.equal(matchCronField('*/15', 15), true);
  assert.equal(matchCronField('*/15', 20), false);
});

test('matchCronField: list field (a,b,c)', () => {
  assert.equal(matchCronField('1,3,5', 3), true);
  assert.equal(matchCronField('1,3,5', 4), false);
});

test('matchCronField: range field (a-b)', () => {
  assert.equal(matchCronField('9-17', 9), true);
  assert.equal(matchCronField('9-17', 17), true);
  assert.equal(matchCronField('9-17', 8), false);
  assert.equal(matchCronField('9-17', 18), false);
});

test('matchCronField: bare number', () => {
  assert.equal(matchCronField('30', 30), true);
  assert.equal(matchCronField('30', 31), false);
});

test('estimateNextRunUtc: null when no schedule', () => {
  assert.equal(estimateNextRunUtc(null), null);
  assert.equal(estimateNextRunUtc(''), null);
});

test('estimateNextRunUtc: null on a malformed cron string', () => {
  assert.equal(estimateNextRunUtc('0 11 * *'), null); // only 4 fields
});

test('estimateNextRunUtc: finds the next daily 11:00 UTC run', () => {
  const from = new Date('2026-09-06T10:00:00.000Z');
  const next = estimateNextRunUtc('0 11 * * *', from);
  assert.ok(next);
  assert.equal(next.toISOString(), '2026-09-06T11:00:00.000Z');
});

test('estimateNextRunUtc: rolls to the next day when the time has passed', () => {
  const from = new Date('2026-09-06T12:00:00.000Z');
  const next = estimateNextRunUtc('0 11 * * *', from);
  assert.ok(next);
  assert.equal(next.toISOString(), '2026-09-07T11:00:00.000Z');
});

test('estimateNextRunUtc: honors day-of-week (Mon/Wed/Fri/Sat = 1,3,5,6)', () => {
  // 2026-09-06 is a Sunday (dow 0) — next 11:00 UTC on 1,3,5,6 is Monday 2026-09-07.
  const from = new Date('2026-09-06T00:00:00.000Z');
  const next = estimateNextRunUtc('0 11 * * 1,3,5,6', from);
  assert.ok(next);
  assert.equal(next.getUTCDay(), 1);
  assert.equal(next.toISOString(), '2026-09-07T11:00:00.000Z');
});

test('estimateNextRunUtc: matches the AXON_CRON_CATALOG self-research schedule shape', () => {
  // Mirrors the real catalog entry's cronUtc: '0 11 * * 1,3,5,6'
  const from = new Date('2026-09-08T11:00:00.000Z'); // Tue 11:00 UTC, exactly on an off-day
  const next = estimateNextRunUtc('0 11 * * 1,3,5,6', from);
  assert.ok(next);
  assert.ok([1, 3, 5, 6].includes(next.getUTCDay()));
});
