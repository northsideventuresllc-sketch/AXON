#!/usr/bin/env node
/**
 * AXON-COMPETITOR-LANE-PROVIDER-0907 — the competitor-synthesis lane fell back to a
 * heuristic ("no AI cascade reachable this run") with only a single attempt at the
 * router chain and no per-tier detail surviving onto the persisted finding row.
 * This proves the fix:
 *   1. synthesizeArea gets a second full pass at the locked router chain before
 *      conceding to the heuristic row (axon-router-core.mjs's own per-tier retry
 *      logic is untouched — this is a caller-level retry of the whole chain call).
 *   2. Every attempt's error text (which already carries axonGenerate's per-tier
 *      breakdown) is kept on the result as `_cascade_errors`, unsliced.
 *   3. runThreeAreaResearch persists that detail into axon_research_findings.meta
 *      instead of dropping it, so a fallback is investigable from the row alone.
 *
 * Offline: no network, no env secrets. Run: node --test tests/axon-synthesis-cascade-retry.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  synthesizeArea,
  runThreeAreaResearch,
  THREE_AREAS,
} from '../lib/axon-self-research-build-plans.mjs';

const CHAIN_EXHAUSTED_MESSAGE =
  'axonGenerate: every tier in the chain failed or was unconfigured: ' +
  'local: mini unreachable | runpod: not deployed yet | openrouter: HTTP 429 | ' +
  'gemini: no key configured | anthropic: HTTP 529';

function failingGenerate(message = CHAIN_EXHAUSTED_MESSAGE) {
  const calls = [];
  const fn = async () => {
    calls.push(Date.now());
    throw new Error(message);
  };
  fn.calls = calls;
  return fn;
}

function fakeSb(ventures = []) {
  const inserted = [];
  const sbSelect = async (table) => {
    if (table === 'content_machine_brand_profiles') return ventures;
    if (table === 'axon_operator_profiles') return [{ context_data: {} }];
    return [];
  };
  const sbInsert = async (table, row) => {
    inserted.push({ table, row });
    return { id: `row-${inserted.length}`, ...row };
  };
  const sbPatch = async () => ({});
  return { sbSelect, sbInsert, sbPatch, inserted };
}

test('synthesizeArea gives the router chain a second full attempt before falling to heuristic', async () => {
  const gen = failingGenerate();

  const result = await synthesizeArea({
    area: THREE_AREAS[0],
    sources: [{ title: 'Source', link: 'https://example.test/s', snippet: 'signal' }],
    jspaceContext: '',
    supabaseKey: 'k',
    generate: gen,
    retryDelayMs: 0,
  });

  assert.equal(gen.calls.length, 2, 'router chain gets a second full attempt, not just one');
  assert.equal(result._provider, 'heuristic');
  assert.equal(result._cascade_errors.length, 2, 'both attempts recorded, neither one swallowed');
  assert.match(result._cascade_errors[0], /^attempt 1\/2:/);
  assert.match(result._cascade_errors[1], /^attempt 2\/2:/);
  assert.match(result._cascade_errors[0], /local: mini unreachable/);
  assert.match(result._cascade_errors[0], /anthropic: HTTP 529/);
});

test('synthesizeArea returns on the first successful attempt — no wasted retry', async () => {
  let calls = 0;
  const gen = async () => {
    calls += 1;
    return {
      text: JSON.stringify({
        finding: 'f',
        equivalent_or_signal: 's',
        build_plan: { what_to_build: 'b', steps: [], effort: 'small', priority: 'low' },
        plain_english: 'p',
        source_urls: [],
      }),
      source: 'gemini',
      model: 'test',
    };
  };

  const result = await synthesizeArea({
    area: THREE_AREAS[0],
    sources: [],
    jspaceContext: '',
    supabaseKey: 'k',
    generate: gen,
    retryDelayMs: 0,
  });

  assert.equal(calls, 1);
  assert.equal(result._provider, 'gemini');
  assert.equal(result._cascade_errors, undefined);
});

test('a whole-chain miss still persists full per-attempt cascade detail on the finding row, not just provider=heuristic', async () => {
  const sb = fakeSb([]);
  const gen = failingGenerate();

  const { results } = await runThreeAreaResearch({
    sbSelect: sb.sbSelect,
    sbInsert: sb.sbInsert,
    sbPatch: sb.sbPatch,
    supabaseKey: 'k',
    serpApiKey: null,
    dryRun: false,
    generate: gen,
    search: async () => [{ title: 'Source', link: 'https://example.test/s', snippet: 'signal' }],
    now: new Date('2026-09-08T12:00:00Z'), // Tuesday — no competitor lane, keeps this to the 3 base areas
    retryDelayMs: 0,
  });

  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.result._provider === 'heuristic'));
  // Each area got its own 2 attempts — 3 areas * 2 attempts = 6 calls total.
  assert.equal(gen.calls.length, 6);

  const rows = sb.inserted.filter((r) => r.table === 'axon_research_findings');
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(Array.isArray(row.row.meta.cascade_errors), 'per-attempt failure detail lands on the row itself');
    assert.equal(row.row.meta.cascade_errors.length, 2);
    assert.match(row.row.meta.cascade_errors[0], /local: mini unreachable/);
    assert.match(row.row.meta.cascade_errors[1], /anthropic: HTTP 529/);
  }
});

test('a successful synthesis writes cascade_errors: null — no stale/empty array clutter on a healthy row', async () => {
  const sb = fakeSb([]);
  const gen = async () => ({
    text: JSON.stringify({
      finding: 'f',
      equivalent_or_signal: 's',
      build_plan: { what_to_build: 'b', steps: [], effort: 'small', priority: 'low' },
      plain_english: 'p',
      source_urls: [],
    }),
    source: 'gemini',
    model: 'test',
  });

  await runThreeAreaResearch({
    sbSelect: sb.sbSelect,
    sbInsert: sb.sbInsert,
    sbPatch: sb.sbPatch,
    supabaseKey: 'k',
    serpApiKey: null,
    dryRun: false,
    generate: gen,
    search: async () => [{ title: 'Source', link: 'https://example.test/s', snippet: 'signal' }],
    now: new Date('2026-09-08T12:00:00Z'),
    retryDelayMs: 0,
  });

  const rows = sb.inserted.filter((r) => r.table === 'axon_research_findings');
  for (const row of rows) {
    assert.equal(row.row.meta.cascade_errors, null);
  }
});
