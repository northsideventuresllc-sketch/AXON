#!/usr/bin/env node
/**
 * AXON agent_bus high-stakes filter tests — run: node tests/agent-bus-high-stakes.test.mjs
 *
 * Covers AX-SMALL-BUILDS-BUNDLE-0904 item (2): lib/axon-agent-bus-high-stakes.mjs.
 * No network — the view-not-applied-yet path is exercised with an injected fake
 * sbSelect that throws on the view name and succeeds on a plain agent_bus select,
 * same fake-client style as tests/axon-cron-guard.test.mjs's Layer 1.
 */
import assert from 'node:assert/strict';
import { computeHighStakesLocally, listHighStakesAgentBus } from '../lib/axon-agent-bus-high-stakes.mjs';

const OLD_ISO = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
const RECENT_ISO = new Date().toISOString();

// ---------- computeHighStakesLocally ----------

assert.equal(
  computeHighStakesLocally(null),
  false,
  'null row is never high-stakes',
);

assert.equal(
  computeHighStakesLocally({ status: 'answered', needs_answer: true, subject: 'deploy this', created_at: RECENT_ISO }),
  false,
  'answered threads are never high-stakes regardless of subject',
);

assert.equal(
  computeHighStakesLocally({ status: 'open', needs_answer: false, subject: 'deploy this', created_at: RECENT_ISO }),
  false,
  'threads that do not need an answer are never high-stakes',
);

assert.equal(
  computeHighStakesLocally({ status: 'open', needs_answer: true, subject: 'please deploy to prod', created_at: RECENT_ISO }),
  true,
  'a gated-action keyword in the subject flags high-stakes',
);

assert.equal(
  computeHighStakesLocally({
    status: 'open',
    needs_answer: true,
    subject: 'unrelated',
    body: { task: 'merge this PR' },
    created_at: RECENT_ISO,
  }),
  true,
  'a gated-action keyword in body.task flags high-stakes even if subject does not match',
);

assert.equal(
  computeHighStakesLocally({ status: 'open', needs_answer: true, subject: 'routine check-in', body: { gated: 'dispatch.fire' }, created_at: RECENT_ISO }),
  true,
  'an explicit body.gated marker flags high-stakes',
);

assert.equal(
  computeHighStakesLocally({ status: 'open', needs_answer: true, subject: 'routine check-in', created_at: OLD_ISO }),
  true,
  'unanswered for >24h flags high-stakes even with no gated keyword',
);

assert.equal(
  computeHighStakesLocally({ status: 'open', needs_answer: true, subject: 'routine check-in', created_at: RECENT_ISO }),
  false,
  'a fresh, non-gated, routine thread is not high-stakes',
);

// ---------- listHighStakesAgentBus: view path ----------
{
  const rows = [{ id: 1, high_stakes: true }];
  const sb = {
    async sbSelect(table) {
      assert.equal(table, 'agent_bus_high_stakes_v', 'view is tried first');
      return rows;
    },
  };
  const result = await listHighStakesAgentBus(sb, { limit: 10 });
  assert.equal(result.source, 'view');
  assert.deepEqual(result.rows, rows);
}

// ---------- listHighStakesAgentBus: view missing -> heuristic fallback ----------
{
  const openGated = { id: 'a', status: 'open', needs_answer: true, subject: 'deploy to prod', created_at: RECENT_ISO };
  const openRoutine = { id: 'b', status: 'open', needs_answer: true, subject: 'hello', created_at: RECENT_ISO };
  const sb = {
    async sbSelect(table) {
      if (table === 'agent_bus_high_stakes_v') {
        throw new Error('relation "agent_bus_high_stakes_v" does not exist');
      }
      assert.equal(table, 'agent_bus');
      return [openGated, openRoutine];
    },
  };
  const result = await listHighStakesAgentBus(sb, { limit: 10 });
  assert.equal(result.source, 'heuristic-fallback');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, 'a');
}

// ---------- listHighStakesAgentBus: both paths fail -> empty, never throws ----------
{
  const sb = {
    async sbSelect() {
      throw new Error('network down');
    },
  };
  const result = await listHighStakesAgentBus(sb, { limit: 10 });
  assert.equal(result.source, 'error');
  assert.deepEqual(result.rows, []);
}

// ---------- listHighStakesAgentBus: no client -> never throws ----------
{
  const result = await listHighStakesAgentBus(null);
  assert.equal(result.source, 'error');
  assert.deepEqual(result.rows, []);
}

console.log('agent-bus-high-stakes: all assertions passed.');
