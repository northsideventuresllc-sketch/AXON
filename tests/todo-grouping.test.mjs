#!/usr/bin/env node
/**
 * B6 — pure grouping logic for the Dash To-Do page: repeating vs non-repeating vs
 * queue. No network, no Supabase — same offline shape as chat-windows.test.mjs.
 *
 * Run: node tests/todo-grouping.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  groupRollingTasks,
  buildQueueRows,
  plainQueueStatus,
  isoWeekday,
} from '../lib/axon-v0/todo-grouping.mjs';

const ROWS = [
  { id: 'd1', task_type: 'recurring', cadence: 'daily', venture: 'Match Fit', description: 'Approve today\'s posts.', status: 'urgent', done: false },
  { id: 'w-thu', task_type: 'recurring', cadence: 'weekly', day_of_week: 4, venture: 'NCC', description: 'Thursday content slot.', status: 'non_urgent', done: false },
  { id: 'w-mon', task_type: 'recurring', cadence: 'weekly', day_of_week: 1, venture: 'NCC', description: 'Monday content slot.', status: 'non_urgent', done: false },
  { id: 'w-fri', task_type: 'recurring', cadence: 'weekly', day_of_week: 5, venture: 'Match Fit', description: 'Friday revenue recap.', status: 'semi_urgent', done: false },
  { id: 'w-sun', task_type: 'recurring', cadence: 'weekly', day_of_week: 7, venture: 'NVG', description: 'Sunday row that should never show.', status: 'non_urgent', done: false },
  { id: 'm1', task_type: 'recurring', cadence: 'monthly', day_of_month: 15, venture: 'NI', description: 'Monthly billing check.', status: 'semi_urgent', done: false },
  { id: 'nr-open', task_type: 'non_repeating', venture: 'NVG', description: 'Board item still open.', status: 'urgent', done: false },
  { id: 'nr-done', task_type: 'non_repeating', venture: 'AXON', description: 'Closed item.', status: 'semi_urgent', done: true },
  { id: 'q1', task_type: 'agentic_question', venture: 'NI', description: 'Should not appear anywhere.', status: 'semi_urgent', done: false },
];

test('groupRollingTasks: daily block first, then the whole Mon-Fri week in weekday order', () => {
  const { repeating } = groupRollingTasks(ROWS, { dayOfWeek: 1, dayOfMonth: 1 });
  assert.deepEqual(
    repeating.map((r) => r.id),
    ['d1', 'w-mon', 'w-thu', 'w-fri']
  );
});

test('groupRollingTasks: weekly grouping is not limited to today, but excludes weekends', () => {
  // Same input regardless of which weekday "today" is — the whole week always shows.
  const monday = groupRollingTasks(ROWS, { dayOfWeek: 1, dayOfMonth: 1 }).repeating;
  const thursday = groupRollingTasks(ROWS, { dayOfWeek: 4, dayOfMonth: 1 }).repeating;
  assert.ok(monday.some((r) => r.id === 'w-mon'));
  assert.ok(monday.some((r) => r.id === 'w-thu'));
  assert.ok(thursday.some((r) => r.id === 'w-mon'));
  assert.ok(thursday.some((r) => r.id === 'w-thu'));
  assert.ok(!monday.some((r) => r.id === 'w-sun'));
  assert.ok(!thursday.some((r) => r.id === 'w-sun'));
});

test('groupRollingTasks: non-repeating includes open, monthly-due-today, and completed', () => {
  const { nonRepeating } = groupRollingTasks(ROWS, { dayOfWeek: 1, dayOfMonth: 15 });
  assert.deepEqual(
    nonRepeating.map((r) => r.id),
    ['nr-open', 'm1', 'nr-done']
  );
});

test('groupRollingTasks: monthly row absent when day-of-month does not match', () => {
  const { nonRepeating } = groupRollingTasks(ROWS, { dayOfWeek: 1, dayOfMonth: 1 });
  assert.ok(!nonRepeating.some((r) => r.id === 'm1'));
});

test('groupRollingTasks: agentic_question rows never appear in either table', () => {
  const { repeating, nonRepeating } = groupRollingTasks(ROWS, { dayOfWeek: 1, dayOfMonth: 15 });
  assert.ok(!repeating.some((r) => r.id === 'q1'));
  assert.ok(!nonRepeating.some((r) => r.id === 'q1'));
});

test('groupRollingTasks: never throws on non-array input', () => {
  const result = groupRollingTasks(null, {});
  assert.deepEqual(result.repeating, []);
  assert.deepEqual(result.nonRepeating, []);
});

test('buildQueueRows: shapes agent_dispatch rows into Code | What | Status', () => {
  const rows = buildQueueRows([
    { code: 'AX-1', title: 'Ship the thing', status: 'queued' },
    { code: 'AX-2', dispatch_phrase: 'do the other thing', status: 'done' },
    { code: null, status: 'done' }, // dropped: no code
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { code: 'AX-1', what: 'Ship the thing', status: 'Queued', done: false });
  assert.deepEqual(rows[1], {
    code: 'AX-2',
    what: 'do the other thing',
    status: 'Done',
    done: true,
  });
});

test('plainQueueStatus: never leaks a raw underscored status code', () => {
  assert.equal(plainQueueStatus('needs_context'), 'Needs more context');
  assert.equal(plainQueueStatus('some_new_code'), 'Some new code');
  assert.equal(plainQueueStatus(null), 'Unknown');
});

test('isoWeekday: Monday=1 through Sunday=7', () => {
  assert.equal(isoWeekday(new Date('2026-09-07T12:00:00Z')), 1); // Monday
  assert.equal(isoWeekday(new Date('2026-09-06T12:00:00Z')), 7); // Sunday
});
