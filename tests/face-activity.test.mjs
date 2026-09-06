#!/usr/bin/env node
/**
 * THE FACE — unit tests for the agent activity trail's shaping layer (Build Plan B, step 4).
 *
 * Everything under test lives in lib/axon-v0/face-activity.mjs: the subject→verb map
 * (including the unknown fallback), relative-time formatting, the combined
 * presence-OR-bus working signal, and trail shaping with empty and missing inputs. No
 * network, no database, no DOM.
 *
 * The rule these tests exist to protect: an unreadable source says "Not answering", never
 * an empty list — and the trail never invents a fact it did not read.
 *
 * Run: node tests/face-activity.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITY_WINDOW_MS,
  BUS_PULSE_WINDOW_MS,
  ACTIVITY_TRAIL_LIMIT,
  hasRecentBusPulse,
  relativeTime,
  resolveActivityWorking,
  shapeActivityTrail,
  shapeFaceActivity,
  shapePresenceList,
  subjectToVerb,
} from '../lib/axon-v0/face-activity.mjs';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const secondsAgo = (s) => new Date(NOW - s * 1000).toISOString();

test('subjectToVerb maps common subject shapes to plain English', () => {
  assert.equal(subjectToVerb('re:AX-VERIFIER-ORPHANED-0813-handoff').verb, 'replied to a message');
  assert.equal(subjectToVerb('DAILY-AXON-REPORT-2026-09-06').verb, 'posted a report');
  assert.equal(subjectToVerb('AXON-EXEC-AGENT-NIGHTLY-2026-09-06').verb, 'posted the nightly plan');
  assert.equal(subjectToVerb('council-weekly-briefing-2026-09-06').verb, 'posted a briefing');
  assert.equal(subjectToVerb('skill-ledger-close').verb, 'updated the skill ledger');
  assert.equal(subjectToVerb('skill-ledger-open').verb, 'updated the skill ledger');
  assert.equal(
    subjectToVerb('PERMANENT-BOARD-nvvault346-hardstop-disclosure-jb-call').verb,
    'flagged a hold for JB'
  );
  assert.equal(subjectToVerb('INSTRUCTION-CHANGE: session/tool setup').verb, 'changed an instruction');
  assert.equal(subjectToVerb('FIX-NEEDED-exec-stored-prompt-injection-0905').verb, 'flagged something that needs fixing');
  assert.equal(subjectToVerb('TRAINING-INGEST-DIGEST-20260906').verb, 'posted a digest');
  assert.equal(subjectToVerb('Fresh SEO/ranking signal for content drafts').verb, 'posted research findings');
  assert.equal(subjectToVerb('SEO Tracker — 0/9 real finding(s)').verb, 'posted research findings');
  assert.equal(subjectToVerb('waiting-on-you: approve the outreach batch').verb, 'asked for approval');
  assert.equal(subjectToVerb('agent-handoff-to-BUILD').verb, 'handed off work');
});

test('subjectToVerb never shows the raw subject for something it does not recognise', () => {
  const result = subjectToVerb('some-totally-unrecognised-subject-line-0906');
  assert.equal(result.verb, 'sent a message', 'unknown subjects fall back to a plain sentence');
  assert.equal(result.kind, 'message');

  assert.equal(subjectToVerb(null).verb, 'sent a message');
  assert.equal(subjectToVerb(undefined).verb, 'sent a message');
  assert.equal(subjectToVerb('').verb, 'sent a message');
  assert.equal(subjectToVerb('   ').verb, 'sent a message');
});

test('subjectToVerb is case- and separator-insensitive', () => {
  assert.equal(subjectToVerb('fix_needed_something').verb, 'flagged something that needs fixing');
  assert.equal(subjectToVerb('Fix Needed: something').verb, 'flagged something that needs fixing');
  assert.equal(subjectToVerb('FIX-NEEDED-SOMETHING').verb, 'flagged something that needs fixing');
});

test('relativeTime formats a spread of ages in plain English', () => {
  assert.equal(relativeTime(secondsAgo(10), NOW), 'just now');
  assert.equal(relativeTime(minutesAgo(1), NOW), '1 min ago');
  assert.equal(relativeTime(minutesAgo(2), NOW), '2 min ago');
  assert.equal(relativeTime(minutesAgo(59), NOW), '59 min ago');
  assert.equal(relativeTime(minutesAgo(60), NOW), '1 hr ago');
  assert.equal(relativeTime(minutesAgo(90), NOW), '1 hr ago');
  assert.equal(relativeTime(minutesAgo(60 * 23), NOW), '23 hr ago');
  assert.equal(relativeTime(minutesAgo(60 * 24), NOW), '1 day ago');
  assert.equal(relativeTime(minutesAgo(60 * 24 * 3), NOW), '3 days ago');
});

test('relativeTime is null for anything it cannot read', () => {
  assert.equal(relativeTime(null, NOW), null);
  assert.equal(relativeTime(undefined, NOW), null);
  assert.equal(relativeTime('not-a-date', NOW), null);
  assert.equal(relativeTime('', NOW), null);
});

test('hasRecentBusPulse is true only for a row inside the two-minute window', () => {
  assert.equal(hasRecentBusPulse([{ created_at: secondsAgo(30) }], NOW), true);
  assert.equal(hasRecentBusPulse([{ created_at: minutesAgo(1) }], NOW), true);
  assert.equal(hasRecentBusPulse([{ created_at: minutesAgo(2.5) }], NOW), false);
  assert.equal(hasRecentBusPulse([{ created_at: minutesAgo(10) }], NOW), false);
  assert.equal(hasRecentBusPulse([], NOW), false);
  assert.equal(hasRecentBusPulse(null, NOW), false);
  assert.equal(hasRecentBusPulse(undefined, NOW), false);
  // A row that is technically in the future (clock skew) is not counted as a pulse.
  assert.equal(hasRecentBusPulse([{ created_at: new Date(NOW + 60_000).toISOString() }], NOW), false);
});

test('shapeActivityTrail keeps only the last 30 minutes, newest first, capped and marked fresh', () => {
  const busRows = [
    { from_agent: 'SENSEI', to_agent: 'EXEC', subject: 'DAILY-AXON-REPORT-2026-09-06', created_at: minutesAgo(25) },
    { from_agent: 'COUNCIL', to_agent: 'ALL', subject: 'skill-ledger-open', created_at: minutesAgo(1) },
    { from_agent: 'PULSE', to_agent: 'ARCEUS', subject: 'FIX-NEEDED-something', created_at: minutesAgo(45) }, // outside the window
    { from_agent: 'AXON Executive', to_agent: 'ALL', subject: 'AXON-EXEC-AGENT-NIGHTLY-2026-09-06', created_at: minutesAgo(10) },
  ];

  const { items, readable } = shapeActivityTrail(busRows, NOW);
  assert.equal(readable, true);
  assert.equal(items.length, 3, 'the 45-minute-old row falls outside the 30-minute window');
  assert.deepEqual(
    items.map((i) => i.from),
    ['COUNCIL', 'AXON Executive', 'SENSEI'],
    'newest first'
  );
  assert.equal(items[0].verb, 'updated the skill ledger');
  assert.equal(items[0].fresh, true, 'a one-minute-old row brightens the dot');
  assert.equal(items[1].fresh, false, 'a ten-minute-old row does not');
  assert.equal(items[0].relative, '1 min ago');

  // Never a raw table name, id or code where a plain verb belongs.
  for (const item of items) {
    assert.notEqual(item.verb, item.subject, 'the verb is never just the raw subject');
  }
});

test('shapeActivityTrail caps at ACTIVITY_TRAIL_LIMIT rows', () => {
  const busRows = Array.from({ length: ACTIVITY_TRAIL_LIMIT + 10 }, (_, i) => ({
    from_agent: `Agent ${i}`,
    subject: 'sent a routine update',
    created_at: minutesAgo(i * 0.1),
  }));

  const { items } = shapeActivityTrail(busRows, NOW);
  assert.equal(items.length, ACTIVITY_TRAIL_LIMIT);
});

test('shapeActivityTrail is honest about an unreadable bus, never an empty list', () => {
  const unreadable = shapeActivityTrail(null, NOW);
  assert.deepEqual(unreadable, { items: [], readable: false });

  const empty = shapeActivityTrail([], NOW);
  assert.deepEqual(empty, { items: [], readable: true }, 'a genuinely quiet 30 minutes is readable and empty');
});

test('shapePresenceList reads agent, status and last-seen, dropping unnamed rows', () => {
  const rows = [
    { agent_name: 'BUILD', status: 'idle', last_seen_at: minutesAgo(5) },
    { agent_name: '  ', status: 'active', last_seen_at: minutesAgo(1) },
    { agent_name: 'EXEC', status: null, last_seen_at: null },
  ];

  const { items, readable } = shapePresenceList(rows);
  assert.equal(readable, true);
  assert.deepEqual(
    items.map((i) => i.agent),
    ['BUILD', 'EXEC']
  );
  assert.equal(items[1].status, null);

  assert.deepEqual(shapePresenceList(null), { items: [], readable: false });
});

test('resolveActivityWorking is true on a fresh bus row even with no presence heartbeat', () => {
  const working = resolveActivityWorking({
    presenceRows: [{ agent_name: 'BUILD', status: 'idle', last_seen_at: minutesAgo(30) }],
    dispatchRows: [],
    busRows: [{ created_at: secondsAgo(20) }],
    nowMs: NOW,
  });
  assert.equal(working, true, 'a bus row inside the two-minute window is enough on its own');
});

test('resolveActivityWorking is true on a presence heartbeat with no recent bus row', () => {
  const working = resolveActivityWorking({
    presenceRows: [{ agent_name: 'BUILD', status: 'active', last_seen_at: minutesAgo(3) }],
    dispatchRows: null,
    busRows: [{ created_at: minutesAgo(20) }],
    nowMs: NOW,
  });
  assert.equal(working, true, 'the existing presence-within-ten-minutes precedence still holds');
});

test('resolveActivityWorking is false when neither source is recent, and null only when both are unreadable', () => {
  const idle = resolveActivityWorking({
    presenceRows: [{ agent_name: 'BUILD', status: 'idle', last_seen_at: minutesAgo(30) }],
    dispatchRows: [],
    busRows: [{ created_at: minutesAgo(20) }],
    nowMs: NOW,
  });
  assert.equal(idle, false, 'a real answer of nothing recent is false, not null');

  const unreadable = resolveActivityWorking({
    presenceRows: null,
    dispatchRows: null,
    busRows: null,
    nowMs: NOW,
  });
  assert.equal(unreadable, null, 'every source unreadable is null — we do not know, so do not guess');

  const busSavesIt = resolveActivityWorking({
    presenceRows: null,
    dispatchRows: null,
    busRows: [{ created_at: secondsAgo(5) }],
    nowMs: NOW,
  });
  assert.equal(busSavesIt, true, 'a readable bus with a fresh row wins even if presence/tickets cannot be read');
});

test('shapeFaceActivity builds the whole route shape, complete even with nothing at all', () => {
  const empty = shapeFaceActivity();
  assert.deepEqual(empty.trail, { items: [], readable: false });
  assert.deepEqual(empty.presence, { items: [], readable: false });
  assert.equal(empty.workingNow, null);
  assert.equal(typeof empty.generatedAt, 'string');

  const populated = shapeFaceActivity({
    busRows: [{ from_agent: 'BUILD', subject: 'skill-ledger-open', created_at: secondsAgo(30) }],
    presenceRows: [{ agent_name: 'BUILD', status: 'active', last_seen_at: secondsAgo(30) }],
    dispatchRows: [],
    nowMs: NOW,
  });
  assert.equal(populated.trail.items.length, 1);
  assert.equal(populated.trail.items[0].verb, 'updated the skill ledger');
  assert.equal(populated.workingNow, true);
});

test('house rule: ACTIVITY_WINDOW_MS and BUS_PULSE_WINDOW_MS match the spec', () => {
  assert.equal(ACTIVITY_WINDOW_MS, 30 * 60 * 1000);
  assert.equal(BUS_PULSE_WINDOW_MS, 2 * 60 * 1000);
});
