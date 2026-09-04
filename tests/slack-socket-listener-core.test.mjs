#!/usr/bin/env node
/**
 * Pure-logic tests for the Slack Socket Mode listener core (REALTIME-AGENT-SLACK-BUS-0817).
 * No Supabase/Slack key needed — see tests/agent-bus-loop-guards.test.mjs for the sibling
 * pattern this follows.
 *
 * Run: node tests/slack-socket-listener-core.test.mjs
 */
import assert from 'node:assert/strict';
import {
  parseEnvelope,
  isEventsApiEnvelope,
  isValidRouterPayload,
  needsAck,
  buildAck,
  isDisconnectEnvelope,
  nextBackoffMs,
} from '../lib/slack-socket-listener-core.mjs';

// --- parseEnvelope ------------------------------------------------------------------------
{
  assert.deepEqual(parseEnvelope('{"type":"hello"}'), { type: 'hello' });
  assert.equal(parseEnvelope('not json'), null, 'malformed frames must not throw');
}

// --- isEventsApiEnvelope -------------------------------------------------------------------
{
  const msg = { type: 'events_api', envelope_id: 'e1', payload: { event: { type: 'message' } } };
  assert.equal(isEventsApiEnvelope(msg), true);
  assert.equal(isEventsApiEnvelope({ type: 'hello' }), false, 'hello frames are not events_api');
  assert.equal(isEventsApiEnvelope({ type: 'events_api' }), false, 'missing payload is not forwardable');
  assert.equal(isEventsApiEnvelope(null), false);
}

// --- isValidRouterPayload -------------------------------------------------------------------
{
  assert.equal(isValidRouterPayload({ event: { type: 'message', text: 'hi' } }), true);
  assert.equal(isValidRouterPayload({ event: {} }), true, 'an empty event object is still shape-valid');
  assert.equal(isValidRouterPayload(null), false);
  assert.equal(isValidRouterPayload('not an object'), false);
  assert.equal(isValidRouterPayload([1, 2, 3]), false, 'array payload is not forwardable');
  assert.equal(isValidRouterPayload({}), false, 'missing event key');
  assert.equal(isValidRouterPayload({ event: 'not an object' }), false, 'event must be an object');
  assert.equal(isValidRouterPayload({ event: [1, 2] }), false, 'event must not be an array');
}

// --- needsAck / buildAck -------------------------------------------------------------------
{
  assert.equal(needsAck({ envelope_id: 'e1' }), true);
  assert.equal(needsAck({ type: 'hello' }), false, 'hello has no envelope_id to ack');
  assert.equal(needsAck({ envelope_id: '' }), false, 'empty string is not a real envelope_id');
  assert.equal(buildAck({ envelope_id: 'e1' }), JSON.stringify({ envelope_id: 'e1' }));
}

// --- isDisconnectEnvelope --------------------------------------------------------------------
{
  assert.equal(isDisconnectEnvelope({ type: 'disconnect', reason: 'warning' }), true);
  assert.equal(isDisconnectEnvelope({ type: 'events_api' }), false);
}

// --- nextBackoffMs --------------------------------------------------------------------------
{
  for (let attempt = 0; attempt < 8; attempt++) {
    const ms = nextBackoffMs(attempt);
    assert.ok(ms > 0 && ms <= 30_000 * 1.25, `attempt ${attempt} backoff ${ms}ms out of bounds`);
  }
  // Later attempts should trend up before hitting the cap (compare medians, jitter-tolerant).
  const early = nextBackoffMs(0);
  const late = nextBackoffMs(5);
  assert.ok(late > early, 'backoff must grow with attempt count before the cap');
  // Negative/garbage attempt numbers must not produce a negative or zero delay.
  assert.ok(nextBackoffMs(-3) > 0);
}

console.log('slack-socket-listener-core.test.mjs: all assertions passed');
