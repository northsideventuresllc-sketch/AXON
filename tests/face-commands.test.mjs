/**
 * THE FACE step 3 — the voice command grammar and both panels' shaping, offline.
 *
 * No network, no database, no browser. Everything under test is pure, so these run
 * anywhere with `node --test` and no credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNKNOWN_COMMAND_REPLY,
  normaliseCommand,
  parseCommand,
  shapeDayPlan,
  shapeNeedsMe,
  spokenLineFor,
} from '../lib/axon-v0/face-commands.mjs';

test('normalisation strips case, punctuation, curly apostrophes and the wake word', () => {
  assert.equal(normaliseCommand("Show me today's plan."), "show me today's plan");
  assert.equal(normaliseCommand('Show me today’s plan!'), "show me today's plan");
  assert.equal(normaliseCommand('  AXON,   show   agents  '), 'show agents');
  assert.equal(normaliseCommand('Hey Axon, please show agents'), 'show agents');
  assert.equal(normaliseCommand('axon'), '');
  assert.equal(normaliseCommand(null), '');
  assert.equal(normaliseCommand(undefined), '');
});

test('"show me today\'s plan" and its wordings all reach the plan panel', () => {
  for (const line of [
    "Show me today's plan",
    'show me todays plan',
    'Axon, what is the plan for today?',
    'day plan',
    'Could you show me the plan',
  ]) {
    assert.equal(parseCommand(line).command, 'plan', line);
  }
});

test('"what needs me" reaches the waiting list, and wins over the word today', () => {
  for (const line of [
    'What needs me',
    'what needs me today',
    'whats waiting on me',
    'what needs my approval',
  ]) {
    assert.equal(parseCommand(line).command, 'needs-me', line);
  }
});

test('"show agents" and "back" return to the module list', () => {
  for (const line of ['Show agents', 'show me the agents', 'back', 'Go back', 'show modules']) {
    assert.equal(parseCommand(line).command, 'modules', line);
  }
});

test('anything else is unknown — never guessed at, never sent anywhere', () => {
  for (const line of ['fire the outreach agent', 'send the email', 'what is the weather', '', '   ']) {
    assert.equal(parseCommand(line).command, null, line);
  }
  assert.equal(spokenLineFor({ panel: 'nonsense' }), UNKNOWN_COMMAND_REPLY);
});

test('the day plan comes from EXEC\'s own post, split into its own lines', () => {
  const plan = shapeDayPlan({
    busRows: [
      {
        body: {
          date: '2026-09-06',
          plain_english_summary: '• First thing\n• Second thing\n\n• Third thing',
        },
        created_at: '2026-09-06T03:24:13Z',
      },
    ],
    noteRows: [],
    todayIso: '2026-09-06',
  });

  assert.equal(plan.source, 'exec-post');
  assert.equal(plan.readable, true);
  assert.deepEqual(plan.items, ['First thing', 'Second thing', 'Third thing']);
});

test('a post from another day is not shown as today, and the session note is the fallback', () => {
  const plan = shapeDayPlan({
    busRows: [{ body: { date: '2026-09-05', plain_english_summary: '• Yesterday' } }],
    noteRows: [{ session_date: '2026-09-06', raw_note: 'Today, from the session note.' }],
    todayIso: '2026-09-06',
  });

  assert.equal(plan.source, 'exec-note');
  assert.deepEqual(plan.items, ['Today, from the session note.']);
});

test('empty inputs are an empty day, unreadable inputs are a failed read — not the same thing', () => {
  const notPosted = shapeDayPlan({ busRows: [], noteRows: [], todayIso: '2026-09-06' });
  assert.equal(notPosted.readable, true);
  assert.deepEqual(notPosted.items, []);
  assert.equal(spokenLineFor({ panel: 'plan', plan: notPosted }), 'No plan posted yet today.');

  const unreadable = shapeDayPlan({ busRows: null, noteRows: null, todayIso: '2026-09-06' });
  assert.equal(unreadable.readable, false);
  assert.equal(
    spokenLineFor({ panel: 'plan', plan: unreadable }),
    'The day plan is not answering right now.'
  );

  // Called with nothing at all it still answers with a complete, well-formed shape.
  const nothing = shapeDayPlan();
  assert.equal(nothing.readable, false);
  assert.deepEqual(nothing.items, []);
});

test('the waiting list keeps parked jobs, drops closed ones, and never shows a job code', () => {
  const shaped = shapeNeedsMe([
    { code: 'COUNCIL-JB-ROUTE-0906', title: 'A decision is waiting. More detail follows.', owner: 'BUILD', status: 'needs_jb' },
    { code: 'X-1', title: 'Approved and finished already.', status: 'done', needs_jb_approval: true },
    { code: 'X-2', title: 'Flagged for approval.', status: 'queued', needs_jb_approval: true },
    { code: 'X-3', title: 'Nobody is waiting on this.', status: 'queued' },
  ]);

  assert.equal(shaped.readable, true);
  assert.equal(shaped.items.length, 2);
  assert.equal(shaped.items[0].what, 'A decision is waiting.');
  assert.equal(shaped.items[0].owner, 'BUILD');
  assert.equal(shaped.items[1].what, 'Flagged for approval.');
  assert.equal(JSON.stringify(shaped).includes('COUNCIL-JB-ROUTE-0906'), false);
});

test('an unreadable queue says so; an empty one says nothing is waiting', () => {
  const unreadable = shapeNeedsMe(null);
  assert.equal(unreadable.readable, false);
  assert.deepEqual(unreadable.items, []);
  assert.equal(
    spokenLineFor({ panel: 'needs-me', needsMe: unreadable }),
    'The waiting list is not answering right now.'
  );

  const empty = shapeNeedsMe([]);
  assert.equal(empty.readable, true);
  assert.equal(spokenLineFor({ panel: 'needs-me', needsMe: empty }), 'Nothing is waiting on you.');
});

test('the spoken line reads back the first three items and counts the rest', () => {
  const line = spokenLineFor({
    panel: 'plan',
    plan: { readable: true, items: ['One', 'Two', 'Three', 'Four', 'Five'] },
  });
  assert.equal(line, "Today's plan. One. Two. Three. And 2 more on screen.");

  assert.equal(
    spokenLineFor({ panel: 'modules', moduleCount: 1 }),
    'Back to the agent list. 1 agent on it.'
  );
  assert.equal(spokenLineFor({ panel: 'modules', moduleCount: null }), 'Back to the agent list.');
});
