#!/usr/bin/env node
/**
 * Build Plan A ticket A2 (AXON side) — proves the folded lanes:
 *   1. AXON Research absorbs the competitor lane (Mon/Wed/Fri day gate, venture
 *      rotation, gap->build-plan row shape reusing axon_research_findings).
 *   2. AXON Content Research absorbs the AI-search-optimization lane (real
 *      questions people ask assistants, not keywords; one finding per venture).
 *   3. Both lanes go through webSearchRows (never SerpApi direct) and the one
 *      router chain (never a hand-rolled provider waterfall), and both return
 *      an honest "no results" status — never a fabricated finding — when the
 *      search door comes back empty.
 *
 * Offline: no network, no env secrets. Run: node --test tests/axon-research-lanes-fold.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCompetitorLaneDay,
  pickCompetitorVenture,
  buildCompetitorArea,
  runThreeAreaResearch,
  COMPETITOR_LANE_ID,
} from '../lib/axon-self-research-build-plans.mjs';
import {
  researchAiSearchAngle,
  aiSearchQuery,
  AI_SEARCH_LANE,
} from '../lib/axon-ai-search-research.mjs';
import { laneSource } from '../lib/axon-generate.mjs';

const VENTURES = [
  { slug: 'match-fit', name: 'Match Fit', venture: 'Match Fit' },
  { slug: 'streampass', name: 'Stream Pass', venture: 'Stream Pass' },
  { slug: 'north-stars', name: 'North-Stars Swim School', venture: 'North-Stars Foundation' },
];

function stubGenerate(text, lane = 'openrouter') {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    return { text, provider: lane, model: 'test-model', source: laneSource(lane) };
  };
  fn.calls = calls;
  return fn;
}

function failingGenerate() {
  return async () => {
    throw new Error('every tier in the chain failed or was unconfigured');
  };
}

function searchReturning(rows) {
  const calls = [];
  const fn = async (serpApiKey, query, num) => {
    calls.push({ serpApiKey, query, num });
    return rows;
  };
  fn.calls = calls;
  return fn;
}

/** Stub for runThreeAreaResearch's `search` seam — never touches the network. */
function stubAreaSearch(rows = [{ title: 'Source', link: 'https://example.test/s', snippet: 'signal' }]) {
  return async () => rows;
}

// ---------------------------------------------------------------------------
// 1. Lane-day selection (Mon/Wed/Fri gate, no new cron)
// ---------------------------------------------------------------------------

test('competitor lane runs only Mon/Wed/Fri (UTC)', () => {
  // 2026-09-06 is a Sunday (day 0); 2026-09-07 Mon; 2026-09-09 Wed; 2026-09-11 Fri; 2026-09-12 Sat.
  assert.equal(isCompetitorLaneDay(new Date('2026-09-06T12:00:00Z')), false); // Sun
  assert.equal(isCompetitorLaneDay(new Date('2026-09-07T12:00:00Z')), true); // Mon
  assert.equal(isCompetitorLaneDay(new Date('2026-09-08T12:00:00Z')), false); // Tue
  assert.equal(isCompetitorLaneDay(new Date('2026-09-09T12:00:00Z')), true); // Wed
  assert.equal(isCompetitorLaneDay(new Date('2026-09-10T12:00:00Z')), false); // Thu
  assert.equal(isCompetitorLaneDay(new Date('2026-09-11T12:00:00Z')), true); // Fri
  assert.equal(isCompetitorLaneDay(new Date('2026-09-12T12:00:00Z')), false); // Sat
});

test('competitor venture rotation picks a real venture from the live list, never invents one', () => {
  const picked = pickCompetitorVenture(VENTURES, new Date('2026-09-07T12:00:00Z'));
  assert.ok(VENTURES.includes(picked));
  assert.equal(pickCompetitorVenture([], new Date()), null);
  assert.equal(pickCompetitorVenture(null, new Date()), null);
});

test('buildCompetitorArea shapes a real, sourced gap-plan instruction — never a fabricated prompt', () => {
  const area = buildCompetitorArea(VENTURES[0]);
  assert.equal(area.id, COMPETITOR_LANE_ID);
  assert.match(area.label, /Match Fit/);
  assert.match(area.query, /Match Fit/);
  assert.match(area.instruction, /never invent a competitor/);
});

// ---------------------------------------------------------------------------
// 2. runThreeAreaResearch: competitor lane folds into the same row shape
// ---------------------------------------------------------------------------

function fakeSb(ventures) {
  const inserted = [];
  const sbSelect = async (table) => {
    if (table === 'content_machine_brand_profiles') return ventures;
    if (table === 'axon_operator_profiles') return [{ context_data: {} }];
    return [];
  };
  const sbInsert = async (table, row) => {
    inserted.push({ table, row });
    if (table === 'axon_research_findings') return { id: `row-${inserted.length}`, ...row };
    if (table === RESEARCH_RUN_TABLE_NAME) return { id: 'run-1', ...row };
    return { id: 'x', ...row };
  };
  const sbPatch = async () => ({});
  return { sbSelect, sbInsert, sbPatch, inserted };
}
const RESEARCH_RUN_TABLE_NAME = 'axon_research_runs';

test('on a lane day, the competitor lane adds a 4th area and writes it to axon_research_findings with brain_gap_category=competitive', async () => {
  const sb = fakeSb(VENTURES);
  const gen = stubGenerate(
    JSON.stringify({
      finding: 'Competitor X shipped live voice coaching.',
      equivalent_or_signal: 'Real-time voice synthesis pipeline',
      build_plan: { what_to_build: 'Voice coaching MVP', steps: ['spike', 'ship'], effort: 'medium', priority: 'high' },
      plain_english: 'A rival added live voice coaching — worth a fast follow.',
      source_urls: ['https://example.test/news'],
    }),
    'openrouter'
  );

  const { results } = await runThreeAreaResearch({
    sbSelect: sb.sbSelect,
    sbInsert: sb.sbInsert,
    sbPatch: sb.sbPatch,
    supabaseKey: 'k',
    serpApiKey: null,
    dryRun: false,
    generate: gen,
    search: stubAreaSearch(),
    now: new Date('2026-09-07T12:00:00Z'), // Monday
  });

  assert.equal(results.length, 4); // 3 base areas + competitor
  const competitorResult = results.find((r) => r.area.id === COMPETITOR_LANE_ID);
  assert.ok(competitorResult, 'competitor area result present');

  const competitorRow = sb.inserted.find(
    (r) => r.table === 'axon_research_findings' && r.row.research_lane === COMPETITOR_LANE_ID
  );
  assert.ok(competitorRow, 'competitor finding written to axon_research_findings');
  assert.equal(competitorRow.row.brain_gap_category, 'competitive');
  assert.equal(competitorRow.row.priority, 'high');
  assert.equal(competitorRow.row.implementation_hint, 'Voice coaching MVP');
  assert.deepEqual(competitorRow.row.source_urls, ['https://example.test/news']);
});

test('off a lane day, only the 3 base areas run — no competitor row, no new cron behavior invented', async () => {
  const sb = fakeSb(VENTURES);
  const gen = stubGenerate(
    JSON.stringify({
      finding: 'f',
      equivalent_or_signal: 's',
      build_plan: { what_to_build: 'b', steps: [], effort: 'small', priority: 'low' },
      plain_english: 'p',
      source_urls: [],
    }),
    'gemini'
  );

  const { results, summary } = await runThreeAreaResearch({
    sbSelect: sb.sbSelect,
    sbInsert: sb.sbInsert,
    sbPatch: sb.sbPatch,
    supabaseKey: 'k',
    serpApiKey: null,
    dryRun: false,
    generate: gen,
    search: stubAreaSearch(),
    now: new Date('2026-09-08T12:00:00Z'), // Tuesday
  });

  assert.equal(results.length, 3);
  assert.ok(!results.some((r) => r.area.id === COMPETITOR_LANE_ID));
  assert.match(summary, /not scheduled today/);
});

test('competitor lane on a lane day with no ventures skips honestly instead of inventing one', async () => {
  const sb = fakeSb([]);
  const gen = stubGenerate('{}', 'gemini');

  const { results, summary } = await runThreeAreaResearch({
    sbSelect: sb.sbSelect,
    sbInsert: sb.sbInsert,
    sbPatch: sb.sbPatch,
    supabaseKey: 'k',
    serpApiKey: null,
    dryRun: false,
    generate: gen,
    search: stubAreaSearch(),
    now: new Date('2026-09-07T12:00:00Z'),
  });

  assert.equal(results.length, 3);
  assert.match(summary, /no ventures found/);
});

// ---------------------------------------------------------------------------
// 3. AI-search-optimization lane (AXON Content Research)
// ---------------------------------------------------------------------------

test('aiSearchQuery asks about real questions, not a keyword string', () => {
  const q = aiSearchQuery({ name: 'Match Fit', skeleton: { value_props: [{ text: 'find a coach' }] } });
  assert.match(q, /what people ask/i);
  assert.match(q, /Match Fit/);
});

test('researchAiSearchAngle uses webSearchRows (injected) then the router chain, never SerpApi direct', async () => {
  const search = searchReturning([
    { title: 'Reddit: is Match Fit legit?', snippet: 'People ask if coaches are vetted', link: 'https://reddit.test/1', source: 'reddit.test' },
  ]);
  const gen = stubGenerate('People ask whether coaches are vetted and how pricing works. Answer that up front in your FAQ.', 'local');

  const result = await researchAiSearchAngle(
    { serpApiKey: 'unused-key', supabaseKey: 'k' },
    { name: 'Match Fit', venture: 'Match Fit', slug: 'match-fit' },
    { search, generate: gen }
  );

  assert.equal(result.lane, AI_SEARCH_LANE);
  assert.equal(result.status, 'OK');
  assert.equal(search.calls.length, 1);
  assert.equal(search.calls[0].serpApiKey, 'unused-key'); // webSearchRows itself owns the SerpApi/DDG fallback
  assert.match(gen.calls[0].opts.system, /AI-search-optimization/);
  assert.equal(result.findingSource, laneSource('local'));
});

test('AI-search lane returns an honest NO_RESULTS status, never a fabricated finding, when search comes back empty', async () => {
  const search = searchReturning([]);
  const gen = stubGenerate('should never be called');

  const result = await researchAiSearchAngle(
    { serpApiKey: null, supabaseKey: 'k' },
    { name: 'Stream Pass', venture: 'Stream Pass', slug: 'streampass' },
    { search, generate: gen }
  );

  assert.equal(result.status, 'NO_RESULTS: no results for this venture\'s AI-search query');
  assert.equal(result.finding, null);
  assert.equal(gen.calls.length, 0); // never synthesizes with no sources
});

test('AI-search lane reports SEARCH_FAILED honestly when the search door throws', async () => {
  const search = async () => {
    throw new Error('duckduckgo unavailable: fetch failed');
  };
  const gen = stubGenerate('should never be called');

  const result = await researchAiSearchAngle(
    { serpApiKey: null, supabaseKey: 'k' },
    { name: 'North-Stars Swim School', venture: 'North-Stars Foundation', slug: 'north-stars' },
    { search, generate: gen }
  );

  assert.match(result.status, /^SEARCH_FAILED:/);
  assert.equal(result.finding, null);
});

test('AI-search lane falls back to real raw results (never invented text) when the router chain is down', async () => {
  const search = searchReturning([
    { title: 'Quora: best online swim lessons', snippet: 'Parents ask about safety ratios', link: 'https://quora.test/1', source: 'quora.test' },
  ]);
  const gen = failingGenerate();

  const result = await researchAiSearchAngle(
    { serpApiKey: null, supabaseKey: 'k' },
    { name: 'North-Stars Swim School', venture: 'North-Stars Foundation', slug: 'north-stars' },
    { search, generate: gen }
  );

  assert.equal(result.status, 'OK');
  assert.equal(result.findingSource, 'raw_search_fallback');
  assert.match(result.finding, /Quora: best online swim lessons/);
});
