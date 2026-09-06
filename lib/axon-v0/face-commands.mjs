/**
 * THE FACE — the voice command grammar, as pure functions (Build Plan B, step 3).
 *
 * No React, no `window`, no Supabase, no `fetch` — same rule as face-summary.mjs, so the
 * whole grammar and every panel's shaping stays testable offline with `node --test`
 * (tests/face-commands.test.mjs) and with no database credentials.
 *
 * Step 3 is deliberately tiny. Three commands, all read-only. Anything else is answered
 * with one plain sentence saying it cannot be done from here yet — nothing is sent to a
 * model, nothing acts on the world, and nothing is invented to fill a gap. A source that
 * could not be read comes back unreadable and draws a written empty state, never a
 * confident wrong answer.
 */

/** The three things the panel can be showing. `modules` is the home state. */
export const FACE_PANELS = ['modules', 'plan', 'needs-me'];

/**
 * Wake words that may sit in front of a command. Optional — "axon, show me today's plan"
 * and "show me today's plan" are the same instruction.
 */
const WAKE_WORDS = ['hey axon', 'ok axon', 'okay axon', 'axon'];

/** Leading filler that carries no meaning once the verb is found. */
const LEADING_FILLER = ['please', 'can you', 'could you', 'would you', 'just'];

/**
 * Normalise a spoken or typed line to something matchable.
 *
 * Speech recognition hands back mixed case, curly apostrophes and trailing punctuation, and
 * a typed fallback hands back whatever was typed. Everything below matches against the
 * output of this function, never against raw input.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function normaliseCommand(input) {
  let text = String(input ?? '')
    .toLowerCase()
    // Curly quotes to straight, so "today’s" and "today's" are the same word.
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip a wake word, then any leading filler, and do it until nothing more comes off —
  // "axon please show agents" has both.
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const word of [...WAKE_WORDS, ...LEADING_FILLER]) {
      if (text === word) {
        text = '';
        stripped = true;
      } else if (text.startsWith(`${word} `)) {
        text = text.slice(word.length + 1);
        stripped = true;
      }
    }
  }

  return text.trim();
}

/** True when every word in `words` appears in the normalised line. */
function hasAll(text, words) {
  return words.every((word) => new RegExp(`\\b${word}\\b`).test(text));
}

/**
 * Which panel a line asks for, or null when nothing matches.
 *
 * Shape, as the spec has it: an optional wake word, then a verb, then a thing.
 * "show me / tell me / what's" + a subject.
 *
 * @param {unknown} input
 * @returns {{ text: string, command: 'plan' | 'needs-me' | 'modules' | null }}
 */
export function parseCommand(input) {
  const text = normaliseCommand(input);
  if (!text) return { text, command: null };

  // "What needs me" is checked before the plan, so "what needs me today" is not read as a
  // request for the day plan just because it contains the word "today".
  if (
    hasAll(text, ['needs', 'me']) ||
    hasAll(text, ['needs', 'my']) ||
    hasAll(text, ['waiting', 'me']) ||
    hasAll(text, ['need', 'me']) ||
    hasAll(text, ['needs', 'jb'])
  ) {
    return { text, command: 'needs-me' };
  }

  if (hasAll(text, ['plan'])) return { text, command: 'plan' };

  if (
    hasAll(text, ['agents']) ||
    hasAll(text, ['modules']) ||
    text === 'back' ||
    text === 'go back'
  ) {
    return { text, command: 'modules' };
  }

  return { text, command: null };
}

/** What is said and shown when the wording is not one of the three. */
export const UNKNOWN_COMMAND_REPLY = "I can't do that from here yet.";

/**
 * The two nearest commands, named plainly, so an unknown line gets a useful answer rather
 * than a list of everything or an error code.
 */
export const UNKNOWN_COMMAND_HINT =
  'Try "show me today\'s plan", "what needs me", or "show agents".';

/** Strip the bullet glyph and spacing off one line of EXEC's written summary. */
function cleanPlanLine(line) {
  return String(line ?? '')
    .replace(/^\s*[•\-*•·]\s*/, '')
    .trim();
}

/**
 * Today's plan, out of whatever EXEC actually posted.
 *
 * Preferred source is EXEC's own daily post on the agent bus — a JSON body carrying a
 * written `plain_english_summary`, one bullet per line. If that is not there for today, the
 * EXEC session note for the same date is used instead. Neither is ever summarised, reworded
 * or padded here: the lines are EXEC's own words, and if there are none the panel says so.
 *
 * `readable: false` means the source could not be read at all, which is a different thing
 * from EXEC not having posted yet — the panel says which.
 *
 * @param {{
 *   busRows?: object[] | null,
 *   noteRows?: object[] | null,
 *   todayIso?: string,
 * }} input
 */
export function shapeDayPlan(input = {}) {
  const todayIso = String(input.todayIso ?? '').slice(0, 10);
  const busRows = Array.isArray(input.busRows) ? input.busRows : null;
  const noteRows = Array.isArray(input.noteRows) ? input.noteRows : null;

  if (busRows === null && noteRows === null) {
    return { source: 'none', date: todayIso || null, items: [], readable: false };
  }

  for (const row of busRows ?? []) {
    const body = row?.body && typeof row.body === 'object' ? row.body : {};
    const rowDate = String(body.date ?? row?.created_at ?? '').slice(0, 10);
    if (todayIso && rowDate !== todayIso) continue;

    const items = String(body.plain_english_summary ?? '')
      .split('\n')
      .map(cleanPlanLine)
      .filter(Boolean);
    if (items.length) {
      return { source: 'exec-post', date: rowDate || todayIso || null, items, readable: true };
    }
  }

  for (const row of noteRows ?? []) {
    const rowDate = String(row?.session_date ?? row?.created_at ?? '').slice(0, 10);
    if (todayIso && rowDate !== todayIso) continue;

    const items = String(row?.raw_note ?? '')
      .split('\n')
      .map(cleanPlanLine)
      .filter(Boolean);
    if (items.length) {
      return { source: 'exec-note', date: rowDate || todayIso || null, items, readable: true };
    }
  }

  return { source: 'none', date: todayIso || null, items: [], readable: true };
}

/**
 * One waiting item, said in plain English.
 *
 * The queue stores a job code and a title that can run to a paragraph. Neither goes on
 * screen as stored: the code is dropped entirely (no codes on this screen, ever) and the
 * title is cut to its first sentence so the list reads as a list.
 */
function toNeedsMeItem(row) {
  const raw = String(row?.title ?? '').replace(/\s+/g, ' ').trim();
  const firstSentence = raw.split(/(?<=[.!?])\s/)[0] ?? raw;
  const trimmed =
    firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trimEnd()}…` : firstSentence;
  const owner = String(row?.owner ?? '').trim();

  return {
    what: trimmed || 'A job in the queue is waiting on you, with nothing written down about it.',
    owner: owner || null,
  };
}

/** Queue statuses that mean the job is finished with, so it is not waiting on anybody. */
const CLOSED_STATUSES = new Set(['done', 'rejected', 'skipped']);

/**
 * Everything waiting on JB, newest first.
 *
 * Two things count: a job parked in the waiting-on-JB status, and a job flagged as needing
 * his approval that has not been closed out. A closed job with the approval flag still set
 * is not waiting on anybody and is dropped.
 *
 * @param {object[] | null | undefined} rows
 */
export function shapeNeedsMe(rows) {
  if (!Array.isArray(rows)) return { items: [], readable: false };

  const items = rows
    .filter((row) => {
      const status = String(row?.status ?? '').toLowerCase().trim();
      if (CLOSED_STATUSES.has(status)) return false;
      return status === 'needs_jb' || status === 'needs_jb_approval' || row?.needs_jb_approval === true;
    })
    .map(toNeedsMeItem);

  return { items, readable: true };
}

/**
 * The one line spoken out loud, and shown, when a panel changes.
 *
 * Everything spoken is also on screen — this is the sentence that goes in both places. It
 * never claims a number it was not handed, and it never reads out more than the first three
 * items, exactly as the spec has it.
 *
 * @param {{ panel: string, plan?: object, needsMe?: object, moduleCount?: number | null }} input
 */
export function spokenLineFor(input = {}) {
  const { panel } = input;

  if (panel === 'plan') {
    const plan = input.plan ?? {};
    if (plan.readable === false) return 'The day plan is not answering right now.';
    const items = Array.isArray(plan.items) ? plan.items : [];
    if (!items.length) return 'No plan posted yet today.';
    const head = items.slice(0, 3).join('. ');
    const rest = items.length > 3 ? ` And ${items.length - 3} more on screen.` : '';
    return `Today's plan. ${head}.${rest}`;
  }

  if (panel === 'needs-me') {
    const needsMe = input.needsMe ?? {};
    if (needsMe.readable === false) return 'The waiting list is not answering right now.';
    const items = Array.isArray(needsMe.items) ? needsMe.items : [];
    if (!items.length) return 'Nothing is waiting on you.';
    const noun = items.length === 1 ? 'thing is' : 'things are';
    return `${items.length} ${noun} waiting on you. ${items
      .slice(0, 3)
      .map((item) => item.what)
      .join('. ')}`;
  }

  if (panel === 'modules') {
    const count = input.moduleCount;
    if (typeof count !== 'number') return 'Back to the agent list.';
    return `Back to the agent list. ${count} ${count === 1 ? 'agent' : 'agents'} on it.`;
  }

  return UNKNOWN_COMMAND_REPLY;
}
