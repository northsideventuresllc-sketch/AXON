#!/usr/bin/env node
/**
 * AX-RETRIEVE-BEFORE-REASON-GATE-0904 — proves lib/axon-retrieve-before-reason.mjs:
 *   1. Queries Learnings/Decisions/Context with an ilike pattern built from the topic,
 *      and folds real hits into a summary string.
 *   2. Degrades to an empty summary (never throws) when the tables return nothing, or
 *      when a query fails outright.
 *   3. Skips the network call entirely for an empty/whitespace-only topic.
 *
 * Run: node tests/retrieve-before-reason.test.mjs
 */
import assert from 'node:assert/strict';
import { retrieveContextBeforeReason } from '../lib/axon-retrieve-before-reason.mjs';

// --- 1. real hits get folded into a summary, across tables ---------------------------
{
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/Learnings')) {
      return { ok: true, json: async () => [{ id: 42, learning: 'Fallback shipping fires an alert now', date: '2026-08-17' }] };
    }
    if (String(url).includes('/Decisions')) {
      return { ok: true, json: async () => [{ id: 7, decision: 'Ship the alert, not a live fix', date: '2026-08-17' }] };
    }
    if (String(url).includes('/Context')) {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await retrieveContextBeforeReason('fake-key', 'why did the shipping fallback fire on that order');
  global.fetch = originalFetch;

  assert.equal(result.hitCount, 2, 'expected 2 hits across Learnings + Decisions');
  assert.equal(result.tableHits.Learnings, 1);
  assert.equal(result.tableHits.Decisions, 1);
  assert.equal(result.tableHits.Context, 0);
  assert.match(result.summary, /Learnings#42/);
  assert.match(result.summary, /Decisions#7/);
  assert.ok(calls.every((u) => u.includes('ilike.*')), 'every call used an ilike pattern, not an exact match');
  console.log('✅ 1. real hits fold into a summary');
}

// --- 2. no hits anywhere -> empty summary, no throw -----------------------------------
{
  global.fetch = async () => ({ ok: true, json: async () => [] });
  const result = await retrieveContextBeforeReason('fake-key', 'a totally novel topic nobody has logged');
  assert.equal(result.hitCount, 0);
  assert.equal(result.summary, '');
  console.log('✅ 2. zero hits degrades to empty summary, not a throw');
}

// --- 3. a query failure degrades the same way, never throws --------------------------
{
  global.fetch = async () => {
    throw new Error('network down');
  };
  const result = await retrieveContextBeforeReason('fake-key', 'anything at all here');
  assert.equal(result.hitCount, 0);
  assert.equal(result.summary, '');
  console.log('✅ 3. a fetch failure degrades to empty, retrieval never throws');
}

// --- 4. empty/whitespace topic never calls the network at all ------------------------
{
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, json: async () => [] };
  };
  const result = await retrieveContextBeforeReason('fake-key', '   ');
  assert.equal(called, false, 'expected no network call for an empty topic');
  assert.equal(result.hitCount, 0);
  console.log('✅ 4. empty topic short-circuits before any network call');
}

console.log('\nAll retrieve-before-reason tests passed.');
