#!/usr/bin/env node
/**
 * AX-FIRE-DISPATCH-CONSUMER — proves the ack note is honest: it names the
 * real source, reports the real queue count, and never claims to have
 * executed dispatch work itself. Pure, no I/O.
 *
 * Run: node tests/axon-fire-dispatch-consumer-core.test.mjs
 */
import assert from 'node:assert/strict';
import { buildFireAckNote } from '../lib/axon-fire-dispatch-consumer-core.mjs';

const NOW = '2026-09-05T12:00:00.000Z';

// --- 1. names the real source and the real queue count -----------------------------------
{
  const note = buildFireAckNote({ source: 'nvg-today-board', queuedCount: 7, nowIso: NOW });
  assert.match(note, /nvg-today-board/);
  assert.match(note, /\b7 agent_dispatch row\(s\)/);
  assert.match(note, /nvg-dispatch-local-runner-v2\.py/);
}

// --- 2. zero queued rows still produces a real, non-fabricated count ---------------------
{
  const note = buildFireAckNote({ source: 'axon-report', queuedCount: 0, nowIso: NOW });
  assert.match(note, /\b0 agent_dispatch row\(s\)/);
}

// --- 3. blank/missing source falls back honestly instead of printing an empty string -----
{
  const note1 = buildFireAckNote({ source: '', queuedCount: 1, nowIso: NOW });
  assert.match(note1, /unknown source/);
  const note2 = buildFireAckNote({ source: '   ', queuedCount: 1, nowIso: NOW });
  assert.match(note2, /unknown source/);
  const note3 = buildFireAckNote({ source: undefined, queuedCount: 1, nowIso: NOW });
  assert.match(note3, /unknown source/);
}

// --- 4. never claims to have run/executed dispatch work itself ---------------------------
{
  const note = buildFireAckNote({ source: 'axon-report', queuedCount: 3, nowIso: NOW });
  assert.doesNotMatch(note, /\bexecuted\b/i);
  assert.match(note, /drains the/);
}

console.log('axon-fire-dispatch-consumer-core: all checks passed');
