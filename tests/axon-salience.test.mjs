#!/usr/bin/env node
/**
 * AX-SALIENCE-DECAY (BPA-C2-BRAIN-GAPS-0906, part c) — run: node tests/axon-salience.test.mjs
 *
 * Proves the failure mode this closes: without decaySalience, an old wisdom
 * row's salience never goes down, so it permanently outranks a fresher,
 * actually-reinforced row. These assertions fail against a no-op / identity
 * "decay" and pass against the real exponential-decay implementation.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_SALIENCE_HALF_LIFE_DAYS,
  SALIENCE_FLOOR,
  decaySalience,
  reinforceSalience,
} from '../lib/axon-salience.mjs';

const NOW = new Date('2026-09-07T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

// ---------- half-life exact at t = halfLife ----------

{
  const rows = [{ id: 'a', salience: 8, last_reinforced_at: daysAgo(DEFAULT_SALIENCE_HALF_LIFE_DAYS) }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, 4, 'exactly one half-life ago -> exactly half the salience');
  assert.equal(out.decayed_from, 8, 'original salience preserved as decayed_from');
}

{
  // Two half-lives -> quarter.
  const rows = [{ id: 'b', salience: 8, last_reinforced_at: daysAgo(2 * DEFAULT_SALIENCE_HALF_LIFE_DAYS) }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, 2, 'two half-lives -> quarter salience');
}

{
  // Custom half-life, exact.
  const rows = [{ id: 'c', salience: 10, last_reinforced_at: daysAgo(21) }];
  const [out] = decaySalience(rows, NOW, 21);
  assert.equal(out.salience, 5);
}

// ---------- no age (reinforced right now) -> unchanged ----------

{
  const rows = [{ id: 'd', salience: 6, last_reinforced_at: NOW.toISOString() }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, 6, 'reinforced at t=now decays by ~0');
}

// ---------- floor ----------

{
  const rows = [{ id: 'e', salience: 9, last_reinforced_at: daysAgo(365) }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, SALIENCE_FLOOR, 'a year-old row floors at SALIENCE_FLOOR, never hits 0');
}

{
  // Even a huge input salience floors, never goes negative or to exactly 0.
  const rows = [{ id: 'f', salience: 1000, last_reinforced_at: daysAgo(10000) }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, SALIENCE_FLOOR);
}

// ---------- missing timestamp -> decays as age 0, never throws / never NaN ----------

{
  const rows = [{ id: 'g', salience: 4 }];
  const [out] = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(out.salience, 4);
  assert.ok(Number.isFinite(out.salience));
}

// ---------- reinforcement bump ----------

{
  const row = { id: 'h', salience: 5, last_reinforced_at: daysAgo(30) };
  const bumped = reinforceSalience(row, { now: NOW, bump: 0.5 });
  assert.equal(bumped.salience, 5.5, 'bump adds the configured amount');
  assert.equal(bumped.last_reinforced_at, NOW.toISOString(), 'reinforcement resets the decay clock to now');

  // A freshly reinforced row should not decay when decaySalience runs immediately after.
  const [decayedAfterBump] = decaySalience([bumped], NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(decayedAfterBump.salience, 5.5, 'no decay immediately after reinforcement');
}

{
  // Bump is capped at the ceiling, never runs away.
  const row = { id: 'i', salience: 9.9, last_reinforced_at: daysAgo(0) };
  const bumped = reinforceSalience(row, { now: NOW, bump: 5 });
  assert.equal(bumped.salience, 10, 'bump caps at SALIENCE_CEILING');
}

// ---------- ordering stability ----------

{
  // Two rows tied at the same decayed salience keep their original relative order.
  const rows = [
    { id: 'tie-1', salience: 5, last_reinforced_at: daysAgo(10) },
    { id: 'tie-2', salience: 5, last_reinforced_at: daysAgo(10) },
  ];
  const out = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.deepEqual(out.map((r) => r.id), ['tie-1', 'tie-2'], 'stable tie-break preserves input order');
}

{
  // Overall ordering: highest post-decay salience first, regardless of input order.
  const rows = [
    { id: 'old-high', salience: 9, last_reinforced_at: daysAgo(60) }, // decays a lot
    { id: 'fresh-mid', salience: 5, last_reinforced_at: daysAgo(1) }, // barely decays
    { id: 'old-low', salience: 3, last_reinforced_at: daysAgo(90) },
  ];
  const out = decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  // fresh-mid (barely decayed from 5) should now outrank old-high (heavily decayed from 9).
  const ids = out.map((r) => r.id);
  assert.equal(ids[0], 'fresh-mid', 'a fresher, lower-salience row can overtake an old high-salience one');
  assert.ok(ids.indexOf('old-high') < ids.indexOf('old-low'), 'still-higher-input-salience row stays ahead of an even-older low one');
}

// ---------- pure: never mutates input ----------

{
  const rows = [{ id: 'j', salience: 8, last_reinforced_at: daysAgo(14) }];
  const snapshotBefore = JSON.stringify(rows);
  decaySalience(rows, NOW, DEFAULT_SALIENCE_HALF_LIFE_DAYS);
  assert.equal(JSON.stringify(rows), snapshotBefore, 'decaySalience does not mutate its input rows');
}

console.log('axon-salience.test.mjs OK');
