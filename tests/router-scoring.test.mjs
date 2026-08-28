#!/usr/bin/env node
/**
 * AXON Omni Router — proves the two scoring rules that must never be "optimised away",
 * plus the hard filters and determinism.
 *
 * scoreLanes is deliberately pure (no I/O) precisely so this test is cheap. If someone
 * later makes it async or gives it a DB call, this file is the tripwire.
 *
 * Run: node tests/router-scoring.test.mjs
 */
import assert from 'node:assert/strict';
import { scoreLanes } from '../lib/axon-router-core.mjs';

const lane = (over = {}) => ({
  laneId: over.laneId || Math.random().toString(36).slice(2),
  model: over.model || 'm',
  route: { id: 'r', name: over.routeName || 'route', cli_command: null, base_url: null, secret_key: null },
  connectorKind: over.connectorKind || 'api',
  capabilities: over.capabilities || ['cheap_chat'],
  costTier: over.costTier ?? 3,
  isSafetyNet: over.isSafetyNet ?? false,
  priority: over.priority ?? 10,
  sortOrder: over.sortOrder ?? 0,
  quotaRef: null,
  health: over.health ?? null,
});

// --- 1. cost_tier 0 outranks a metered lane at equal capability fit -------------------
{
  const free = lane({ laneId: 'free', costTier: 0, routeName: 'ollama-local', connectorKind: 'local' });
  const paid = lane({ laneId: 'paid', costTier: 3, routeName: 'anthropic-api' });
  const ranked = scoreLanes([paid, free], { capabilityClass: 'cheap_chat' });
  assert.equal(ranked[0].lane.laneId, 'free', 'free/local must outrank metered at equal fit');
}

// --- 2. the paid safety net is never excluded on cost, and never wins a tie -----------
{
  const sub = lane({ laneId: 'sub', costTier: 0, connectorKind: 'subscription' });
  const net = lane({ laneId: 'net', costTier: 3, isSafetyNet: true });
  const ranked = scoreLanes([net, sub], { capabilityClass: 'cheap_chat' });
  assert.equal(ranked.length, 2, 'the safety net must stay in the candidate list, not be filtered out');
  assert.equal(ranked[0].lane.laneId, 'sub', 'subscription beats the paid safety net');
  assert.equal(ranked[1].lane.laneId, 'net', 'safety net sorts last');
}

// --- 3. ...but it rises to the top when it is the only lane left ----------------------
{
  const net = lane({ laneId: 'net', costTier: 3, isSafetyNet: true, capabilities: ['code_build'] });
  const wrong = lane({ laneId: 'wrong', costTier: 0, capabilities: ['vision'] });
  const ranked = scoreLanes([wrong, net], { capabilityClass: 'code_build' });
  assert.equal(ranked.length, 1, 'capability mismatch is a hard filter, not a penalty');
  assert.equal(ranked[0].lane.laneId, 'net', 'the safety net serves when nothing else can');
}

// --- 4. an open circuit still inside its backoff is excluded; an expired one is not ----
{
  const open = lane({
    laneId: 'open',
    costTier: 0,
    health: { status: 'circuit_open', retry_after: new Date(Date.now() + 60_000).toISOString() },
  });
  const ok = lane({ laneId: 'ok', costTier: 3 });
  const ranked = scoreLanes([open, ok], { capabilityClass: 'cheap_chat' });
  assert.deepEqual(ranked.map((r) => r.lane.laneId), ['ok'], 'an open breaker excludes the lane');

  const expired = lane({
    laneId: 'expired',
    costTier: 0,
    health: { status: 'circuit_open', retry_after: new Date(Date.now() - 60_000).toISOString() },
  });
  assert.equal(
    scoreLanes([expired], { capabilityClass: 'cheap_chat' }).length,
    1,
    'once retry_after has passed the lane is eligible again',
  );
}

// --- 5. an unclassified lane is usable but ranks below an explicit match --------------
{
  const exact = lane({ laneId: 'exact', costTier: 2, capabilities: ['code_build'] });
  const general = lane({ laneId: 'general', costTier: 2, capabilities: [] });
  const ranked = scoreLanes([general, exact], { capabilityClass: 'code_build' });
  assert.equal(ranked[0].lane.laneId, 'exact');
  assert.equal(ranked[1].lane.laneId, 'general');
}

// --- 6. deterministic: same input, same order, every time -----------------------------
{
  const lanes = [
    lane({ laneId: 'a', costTier: 0, priority: 20 }),
    lane({ laneId: 'b', costTier: 0, priority: 10 }),
    lane({ laneId: 'c', costTier: 0, priority: 30 }),
  ];
  const first = scoreLanes(lanes, { capabilityClass: 'cheap_chat' }).map((r) => r.lane.laneId);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(
      scoreLanes(lanes, { capabilityClass: 'cheap_chat' }).map((r) => r.lane.laneId),
      first,
      'identical health state must always yield the identical pick',
    );
  }
  assert.deepEqual(first, ['b', 'a', 'c'], 'priority is the stable final tie-break');
}

// --- 7. every ranked lane carries a human-readable reason for the UI ------------------
{
  const ranked = scoreLanes([lane({ costTier: 0, connectorKind: 'subscription' })], {
    capabilityClass: 'cheap_chat',
  });
  assert.ok(ranked[0].reasons.length >= 2, 'a decision must be explainable');
  assert.ok(
    ranked[0].reasons.some((r) => r.includes('subscription already paid for')),
    'a subscription lane says why it is free',
  );
}

console.log('router-scoring: all 7 checks passed');
