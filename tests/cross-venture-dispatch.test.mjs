#!/usr/bin/env node
/**
 * AXON usability item #6 (cross-venture dispatch) — proves validateCrossVentureDispatch
 * actually enforces "cross-venture": it refuses a same-venture dispatch, self-dispatch,
 * and missing agents/task, and only allows the case that is genuinely two different
 * ventures with a real task. Pure, no I/O — same reasoning as
 * tests/agent-bus-loop-guards.test.mjs.
 *
 * Run: node tests/cross-venture-dispatch.test.mjs
 */
import assert from 'node:assert/strict';
import { validateCrossVentureDispatch } from '../lib/axon-v0/cross-venture-dispatch.mjs';

const execA = { id: 'agent-a', venture_id: 'venture-1', name: 'NI Exec' };
const execB = { id: 'agent-b', venture_id: 'venture-2', name: 'Match Fit Exec' };
const alsoVenture1 = { id: 'agent-c', venture_id: 'venture-1', name: 'NI Build Manager' };

// --- 1. the actual happy path: two different ventures, a real task ----------------------
{
  const r = validateCrossVentureDispatch({ fromAgent: execA, toAgent: execB, task: 'check the outreach queue' });
  assert.equal(r.allowed, true, 'a genuine cross-venture dispatch with a real task must be allowed');
  assert.equal(r.reason, null);
}

// --- 2. same venture is refused — that is what the venture room's own chat is for -------
{
  const r = validateCrossVentureDispatch({ fromAgent: execA, toAgent: alsoVenture1, task: 'do the thing' });
  assert.equal(r.allowed, false, 'a same-venture "dispatch" must be refused');
  assert.match(r.reason, /same venture/);
}

// --- 3. an agent cannot dispatch to itself -----------------------------------------------
{
  const r = validateCrossVentureDispatch({ fromAgent: execA, toAgent: execA, task: 'do the thing' });
  assert.equal(r.allowed, false, 'an agent dispatching to itself must be refused');
  assert.match(r.reason, /itself/);
}

// --- 4. no task given is refused, whitespace-only counts as no task ---------------------
{
  const r1 = validateCrossVentureDispatch({ fromAgent: execA, toAgent: execB, task: '' });
  assert.equal(r1.allowed, false);
  const r2 = validateCrossVentureDispatch({ fromAgent: execA, toAgent: execB, task: '   ' });
  assert.equal(r2.allowed, false, 'whitespace-only task must count as no task');
}

// --- 5. an unknown agent on either side is refused, not silently treated as allowed ------
{
  const r1 = validateCrossVentureDispatch({ fromAgent: null, toAgent: execB, task: 'x' });
  assert.equal(r1.allowed, false, 'a missing sending agent must be refused');
  const r2 = validateCrossVentureDispatch({ fromAgent: execA, toAgent: null, task: 'x' });
  assert.equal(r2.allowed, false, 'a missing target agent must be refused');
}

console.log('cross-venture-dispatch: all checks passed');
