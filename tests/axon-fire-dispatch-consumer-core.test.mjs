#!/usr/bin/env node
/**
 * AX-FIRE-DISPATCH-CONSUMER — proves the ack note is honest: it names the
 * real source, reports the real queue count, and never claims to have
 * executed dispatch work itself. Pure, no I/O.
 *
 * Also exercises processFireRequests() end-to-end against a fake
 * sbSelect/sbPatch (same DI shape as axon-cron-guard.mjs) -- council
 * stress-test finding 2026-09-05: no test previously demonstrated a
 * manual_fire_requests row actually gets claimed+closed by the consumer.
 *
 * Run: node tests/axon-fire-dispatch-consumer-core.test.mjs
 */
import assert from 'node:assert/strict';
import { buildFireAckNote, processFireRequests } from '../lib/axon-fire-dispatch-consumer-core.mjs';

const NOW_ISO = '2026-09-05T12:00:00.000Z';

/** Minimal PostgREST-filter-aware fake, enough for the two queries + two patches this consumer issues. */
function makeFakeSupabase({ manual_fire_requests = [], agent_dispatch = [] }) {
  const state = {
    manual_fire_requests: manual_fire_requests.map((r) => ({ ...r })),
    agent_dispatch: agent_dispatch.map((r) => ({ ...r })),
  };

  function matches(rows, filter) {
    const eqPairs = filter
      .split('&')
      .map((p) => p.split('='))
      .filter(([, v]) => v && v.startsWith('eq.'))
      .map(([k, v]) => [k, decodeURIComponent(v.slice(3))]);
    return rows.filter((row) => eqPairs.every(([k, v]) => String(row[k]) === v));
  }

  async function sbSelect(table, filter = '') {
    return matches(state[table] || [], filter).map((r) => ({ ...r }));
  }

  async function sbPatch(table, filter, patch) {
    const matched = matches(state[table] || [], filter);
    if (matched.length === 0) return null; // atomic-guard miss: nothing left matching the filter
    for (const row of matched) Object.assign(row, patch);
    return matched[0];
  }

  return { state, sbSelect, sbPatch };
}

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

// --- 5. a real queued row actually gets claimed (processing) then closed (done) ----------
{
  const fake = makeFakeSupabase({
    manual_fire_requests: [{ id: 'fr-1', status: 'queued', source: 'axon-report', requested_at: NOW_ISO }],
    agent_dispatch: [
      { id: 'ad-1', status: 'queued', executor: 'local_ollama' },
      { id: 'ad-2', status: 'queued', executor: 'local_ollama' },
    ],
  });

  const result = await processFireRequests({ sbSelect: fake.sbSelect, sbPatch: fake.sbPatch, nowIso: () => NOW_ISO });

  assert.deepEqual(result, { acked: 1, raced: 0, total: 1 });
  const row = fake.state.manual_fire_requests[0];
  assert.equal(row.status, 'done');
  assert.ok(row.picked_up_at, 'row was claimed (picked_up_at set) before being closed');
  assert.ok(row.completed_at, 'row was closed (completed_at set)');
  assert.match(row.note, /axon-report/);
  assert.match(row.note, /\b2 agent_dispatch row\(s\)/);
}

// --- 6. a row already claimed by another run is raced, not double-processed --------------
{
  const fake = makeFakeSupabase({
    manual_fire_requests: [
      { id: 'fr-2', status: 'queued', source: 'nvg-today-board', requested_at: NOW_ISO },
      { id: 'fr-3', status: 'queued', source: 'nvg-today-board', requested_at: NOW_ISO },
    ],
    agent_dispatch: [],
  });
  // Simulate a concurrent run winning the claim on fr-2 in the window between
  // this run's select and its own claim-patch, by making the guard-patch fail
  // for fr-2 specifically while behaving normally for everything else.
  const realPatch = fake.sbPatch;
  const sbPatch = async (table, filter, patch) => {
    if (table === 'manual_fire_requests' && filter.includes('id=eq.fr-2') && filter.includes('status=eq.queued')) {
      return null;
    }
    return realPatch(table, filter, patch);
  };

  const result = await processFireRequests({ sbSelect: fake.sbSelect, sbPatch, nowIso: () => NOW_ISO });

  assert.deepEqual(result, { acked: 1, raced: 1, total: 2 });
  assert.equal(fake.state.manual_fire_requests.find((r) => r.id === 'fr-2').status, 'queued', 'raced row left untouched, not marked done');
  assert.equal(fake.state.manual_fire_requests.find((r) => r.id === 'fr-3').status, 'done', 'non-raced row still claimed+closed');
}

// --- 7. no queued rows is a clean no-op, not an error -------------------------------------
{
  const fake = makeFakeSupabase({ manual_fire_requests: [], agent_dispatch: [] });
  const result = await processFireRequests({ sbSelect: fake.sbSelect, sbPatch: fake.sbPatch, nowIso: () => NOW_ISO });
  assert.deepEqual(result, { acked: 0, raced: 0, total: 0 });
}

console.log('axon-fire-dispatch-consumer-core: all checks passed');
