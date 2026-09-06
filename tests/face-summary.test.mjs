#!/usr/bin/env node
/**
 * THE FACE — unit tests for the home screen's shaping layer (Build Plan B, step 2).
 *
 * Everything under test lives in lib/axon-v0/face-summary.mjs: the health-to-plain-word
 * mapping, the Live/Planned grouping, the working-signal source choice, and the summary
 * shaping with empty and missing inputs. No network, no database, no DOM.
 *
 * The rule these tests exist to protect: an unreadable source is null, never zero. A zero
 * on JB's home screen is a claim that nothing is happening; null is the honest "we could
 * not read this", and it is what draws the empty state.
 *
 * Run: node tests/face-summary.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKING_WINDOW_MS,
  countAgentsLive,
  countAgentsWorking,
  countLeadsThisWeek,
  countOpenTickets,
  groupModules,
  isLiveModule,
  parseExactCount,
  planFaceFetch,
  plainModuleHealth,
  shapeFaceSummary,
} from '../lib/axon-v0/face-summary.mjs';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60_000).toISOString();

test('health maps to plain words, never a status code', () => {
  assert.equal(plainModuleHealth({ active: true, health_status: 'healthy' }), 'On track');
  assert.equal(plainModuleHealth({ active: true, health_status: 'ok' }), 'On track');
  assert.equal(plainModuleHealth({ active: true, health_status: 'stale' }), 'Quiet');
  assert.equal(plainModuleHealth({ active: true, health_status: 'degraded' }), 'Needs attention');
  assert.equal(plainModuleHealth({ active: true, health_status: 'critical' }), 'Needs attention');
  assert.equal(plainModuleHealth({ active: false, health_status: 'archived' }), 'Off');
  assert.equal(plainModuleHealth({ active: true, health_status: 'archived' }), 'Off');
});

test('a retired or unknown row never claims to be on track', () => {
  assert.equal(
    plainModuleHealth({ active: true, health_status: 'healthy', retired_at: daysAgo(1) }),
    'Off',
    'a retired row is off however healthy it says it is'
  );
  assert.equal(
    plainModuleHealth({ active: true, health_status: 'something_new' }),
    'Quiet',
    'an unrecognised health value is quiet, not a green light'
  );
  assert.equal(plainModuleHealth({ active: true, health_status: null }), 'Quiet');
  assert.equal(plainModuleHealth({}), 'Off', 'no active flag means it is not running');
});

test('modules split into Live and Planned and sort by name', () => {
  const rows = [
    { agent_name: 'PULSE', active: true, health_status: 'healthy' },
    { agent_name: 'Ads Manager', active: false, health_status: 'archived' },
    { agent_name: 'BUILD', active: true, health_status: 'stale' },
    { agent_name: '   ', active: true, health_status: 'healthy' },
  ];

  const { live, planned } = groupModules(rows);
  assert.deepEqual(
    live.map((m) => m.name),
    ['BUILD', 'PULSE'],
    'live rows are the switched-on ones, sorted by name'
  );
  assert.deepEqual(planned.map((m) => m.name), ['Ads Manager']);
  assert.equal(live[0].health, 'Quiet');
  assert.equal(planned[0].health, 'Off');
  assert.equal(isLiveModule(rows[0]), true);

  assert.deepEqual(groupModules([]), { live: [], planned: [] }, 'an empty roster is empty, not an error');
  assert.deepEqual(groupModules(null), { live: [], planned: [] });
});

test('the roster count is null when the roster could not be read', () => {
  assert.equal(countAgentsLive(null), null, 'unreadable is null, never zero');
  assert.equal(countAgentsLive([]), 0, 'an empty roster really is zero live agents');
  assert.equal(
    countAgentsLive([
      { agent_name: 'A', active: true, health_status: 'healthy' },
      { agent_name: 'B', active: false, health_status: 'archived' },
    ]),
    1
  );
});

test('agents working is counted from heartbeats when presence is readable', () => {
  const presence = [
    { agent_name: 'A', status: 'active', last_seen_at: minutesAgo(2) },
    { agent_name: 'B', status: 'active', last_seen_at: minutesAgo(45) },
    { agent_name: 'C', status: 'idle', last_seen_at: minutesAgo(1) },
    { agent_name: 'D', status: 'active', last_seen_at: null },
  ];

  const result = countAgentsWorking(presence, null, NOW);
  assert.equal(result.source, 'presence');
  assert.equal(result.count, 1, 'only a recent heartbeat on a non-idle row counts');

  const edge = countAgentsWorking(
    [{ status: 'active', last_seen_at: new Date(NOW - WORKING_WINDOW_MS + 1000).toISOString() }],
    null,
    NOW
  );
  assert.equal(edge.count, 1, 'just inside the window still counts');
});

test('the ticket queue is the fallback only when presence cannot be read', () => {
  const tickets = [
    { status: 'running', updated_at: minutesAgo(3) },
    { status: 'running', updated_at: minutesAgo(90) },
    { status: 'queued', updated_at: minutesAgo(1) },
  ];

  const fallback = countAgentsWorking(null, tickets, NOW);
  assert.equal(fallback.source, 'tickets');
  assert.equal(fallback.count, 1);

  const both = countAgentsWorking([], tickets, NOW);
  assert.equal(both.source, 'presence', 'a readable but empty presence table still wins');
  assert.equal(both.count, 0);

  const neither = countAgentsWorking(null, null, NOW);
  assert.deepEqual(neither, { count: null, source: 'none' });
});

test('open tickets exclude the ones already closed out', () => {
  const rows = [
    { status: 'queued' },
    { status: 'needs_context' },
    { status: 'done' },
    { status: 'rejected' },
    { status: 'skipped' },
    { status: 'needs_jb' },
  ];
  assert.equal(countOpenTickets(rows), 3, 'done, rejected and skipped are all finished with');
  assert.equal(countOpenTickets([]), 0);
  assert.equal(countOpenTickets(null), null, 'unreadable is null, never zero');
});

test('leads count the last seven days only', () => {
  const rows = [
    { created_at: daysAgo(1) },
    { created_at: daysAgo(6) },
    { created_at: daysAgo(9) },
    { created_at: null },
  ];
  assert.equal(countLeadsThisWeek(rows, NOW), 2);
  assert.equal(countLeadsThisWeek([], NOW), 0);
  assert.equal(countLeadsThisWeek(null, NOW), null);
});

test('the summary shape survives having nothing at all to read', () => {
  const summary = shapeFaceSummary({ nowMs: NOW });

  assert.equal(summary.agentsLive, null);
  assert.equal(summary.agentsWorking, null);
  assert.equal(summary.workingSource, 'none');
  assert.equal(summary.openTickets, null);
  assert.equal(summary.leadsThisWeek, null);
  assert.equal(summary.revenue, null, 'revenue is never a number until Finance is wired');
  assert.deepEqual(summary.modules.live, []);
  assert.deepEqual(summary.modules.planned, []);
  assert.equal(summary.modules.total, 0);
  assert.equal(summary.modules.readable, false, 'the module panel must be able to say it is blind');
  assert.equal(summary.generatedAt, new Date(NOW).toISOString());

  // Called with no argument at all it still returns a complete object.
  const bare = shapeFaceSummary();
  assert.equal(bare.agentsLive, null);
  assert.equal(bare.modules.total, 0);
});

test('the summary shape fills in from real rows', () => {
  const summary = shapeFaceSummary({
    rosterRows: [
      { agent_name: 'PULSE', active: true, health_status: 'healthy' },
      { agent_name: 'Finance Manager', active: false, health_status: 'archived' },
    ],
    presenceRows: [{ status: 'active', last_seen_at: minutesAgo(1) }],
    dispatchRows: [{ status: 'queued' }, { status: 'done' }],
    leadRows: [{ created_at: daysAgo(2) }],
    nowMs: NOW,
  });

  assert.equal(summary.agentsLive, 1);
  assert.equal(summary.agentsWorking, 1);
  assert.equal(summary.workingSource, 'presence');
  assert.equal(summary.openTickets, 1);
  assert.equal(summary.leadsThisWeek, 1);
  assert.equal(summary.revenue, null);
  assert.equal(summary.modules.total, 2);
  assert.equal(summary.modules.readable, true);
  assert.equal(summary.modules.live[0].name, 'PULSE');
  assert.equal(summary.modules.planned[0].health, 'Off');
});

test('an empty roster reads as zero live agents, not as unreadable', () => {
  const summary = shapeFaceSummary({ rosterRows: [], nowMs: NOW });
  assert.equal(summary.agentsLive, 0);
  assert.equal(summary.modules.readable, true, 'we read it — there was just nothing in it');
});

test('a screen mounted in a hidden tab still settles its loading state', () => {
  // The defect this guards against: the poll used to bail out before the loading flag was
  // cleared, so a screen opened behind another tab sat on "Reading…" until it was looked at.
  const hiddenAtMount = planFaceFetch({ hidden: true, inFlight: false });
  assert.equal(hiddenAtMount.fetch, false, 'a hidden tab does not spend a request');
  assert.equal(
    hiddenAtMount.settleLoading,
    true,
    'but it must stop claiming to be reading — loading settles to false'
  );

  assert.deepEqual(
    planFaceFetch({ hidden: false, inFlight: false }),
    { fetch: true, settleLoading: false },
    'a visible tab reads'
  );

  // A tick that lands while a request is still out is skipped, not stacked — and it must
  // not settle loading either, because the request in flight will do that itself.
  assert.deepEqual(planFaceFetch({ hidden: false, inFlight: true }), {
    fetch: false,
    settleLoading: false,
  });
  assert.deepEqual(planFaceFetch({ hidden: true, inFlight: true }), {
    fetch: false,
    settleLoading: false,
  });

  assert.deepEqual(planFaceFetch(), { fetch: true, settleLoading: false }, 'defaults to reading');
});

test('the exact open-ticket count is read off Content-Range', () => {
  // PostgREST answers `Prefer: count=exact` with the total after the slash. This is how the
  // ticket number stays right past any page size — counting a capped page would silently
  // stop climbing once the queue outgrew it.
  assert.equal(parseExactCount('0-0/183'), 183);
  assert.equal(parseExactCount('0-24/3573'), 3573);
  assert.equal(parseExactCount('*/0'), 0, 'an empty result is a real zero');
  assert.equal(parseExactCount('0-24/ 91 '), 91, 'whitespace around the total is fine');

  // Anything that is not a real total is null, so the card shows its empty state rather
  // than a zero standing in for a number nobody read.
  assert.equal(parseExactCount('0-24/*'), null, 'no count was asked for');
  assert.equal(parseExactCount('0-24'), null, 'no total in the header at all');
  assert.equal(parseExactCount(''), null);
  assert.equal(parseExactCount(null), null);
  assert.equal(parseExactCount(undefined), null);
  assert.equal(parseExactCount('0-24/not-a-number'), null);
  assert.equal(parseExactCount('0-24/-5'), null, 'a negative total is not a count');
});

test('the exact ticket count wins over counting a page of rows', () => {
  const rows = [{ status: 'queued' }, { status: 'queued' }];

  const counted = shapeFaceSummary({ dispatchRows: rows, openTicketsCount: 183, nowMs: NOW });
  assert.equal(counted.openTickets, 183, 'the head-count is the number on screen');

  const unreadable = shapeFaceSummary({ dispatchRows: rows, openTicketsCount: null, nowMs: NOW });
  assert.equal(unreadable.openTickets, null, 'a failed count is null, never the page length');

  const noCount = shapeFaceSummary({ dispatchRows: rows, nowMs: NOW });
  assert.equal(noCount.openTickets, 2, 'with no head-count given, the rows are counted');
});
