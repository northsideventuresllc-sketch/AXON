/**
 * THE FACE — pure shaping for the agent activity trail (Build Plan B, step 4).
 *
 * Same house rules as lib/axon-v0/face-summary.mjs: no React, no `window`, no Supabase, no
 * `fetch`. The route (app/api/axon-v0/face/activity/route.ts) does the reading and hands the
 * rows in here. Kept pure so the subject→verb map, the relative-time formatting and the
 * working-signal precedence are all testable offline with `node --test`
 * (tests/face-activity.test.mjs) and with no database credentials.
 *
 * Tables read, both read-only:
 *   agent_bus           — from_agent, to_agent, subject, created_at. Drives the trail and,
 *                         alongside presence, the orb's working signal.
 *   nvg_agent_presence   — agent_name, status, last_seen_at. The existing presence signal.
 *
 * **The trail never shows raw table names, ids or codes.** A subject like
 * `AXON-EXEC-AGENT-NIGHTLY-2026-09-06` never reaches the screen — `subjectToVerb` turns it
 * into a plain sentence fragment ("posted the nightly plan") before it is drawn. The raw
 * `subject` is still returned on the wire for debugging and future refinement, but the
 * component that renders the trail must only read `verb`, `from` and `relative`.
 */
import { WORKING_WINDOW_MS, countAgentsWorking } from './face-summary.mjs';

/** How far back the activity trail looks. */
export const ACTIVITY_WINDOW_MS = 30 * 60 * 1000;

/** A bus row this recent counts as "agents working" on its own, independent of presence. */
export const BUS_PULSE_WINDOW_MS = 2 * 60 * 1000;

/** How many trail rows the screen shows, newest first. */
export const ACTIVITY_TRAIL_LIMIT = 30;

/**
 * Ordered subject → plain-English verb rules. First match wins, so put the more specific
 * patterns first. Matching is case-insensitive and tolerant of `-`/`_`/` ` as the same word
 * break, so `FIX-NEEDED`, `fix_needed` and `Fix Needed` all land on the same rule.
 */
const VERB_RULES = [
  { test: /^re[:\s]/, kind: 'reply', verb: 'replied to a message' },
  { test: /needs[\s_-]?jb|approval|waiting[\s_-]?on[\s_-]?you/, kind: 'approval', verb: 'asked for approval' },
  { test: /permanent[\s_-]?board|hard[\s_-]?stop|hardstop/, kind: 'hold', verb: 'flagged a hold for JB' },
  { test: /hand[\s_-]?off/, kind: 'handoff', verb: 'handed off work' },
  { test: /fix[\s_-]?needed|fix[\s_-]?required/, kind: 'fix', verb: 'flagged something that needs fixing' },
  { test: /instruction[\s_-]?change/, kind: 'instruction', verb: 'changed an instruction' },
  { test: /skill[\s_-]?ledger/, kind: 'ledger', verb: 'updated the skill ledger' },
  { test: /nightly/, kind: 'plan', verb: 'posted the nightly plan' },
  { test: /brief(ing)?/, kind: 'briefing', verb: 'posted a briefing' },
  { test: /daily[\s_-]?.*report|report/, kind: 'report', verb: 'posted a report' },
  { test: /digest|ingest/, kind: 'digest', verb: 'posted a digest' },
  { test: /tracker|research|signal|finding/, kind: 'research', verb: 'posted research findings' },
  { test: /close(d)?[\s_-]?out|session[\s_-]?close/, kind: 'close', verb: 'closed out a session' },
];

/**
 * A plain-English verb for a subject line. Unrecognised subjects fall back to a generic,
 * still-plain sentence rather than showing the raw subject text.
 *
 * @param {string | null | undefined} subject
 * @returns {{ verb: string, kind: string }}
 */
export function subjectToVerb(subject) {
  const value = String(subject ?? '').trim();
  if (!value) return { verb: 'sent a message', kind: 'message' };
  const lower = value.toLowerCase();
  for (const rule of VERB_RULES) {
    if (rule.test.test(lower)) return { verb: rule.verb, kind: rule.kind };
  }
  return { verb: 'sent a message', kind: 'message' };
}

/**
 * A short relative-time phrase for a past timestamp. Null when the timestamp cannot be
 * read, which the trail renders as a blank rather than a guess.
 *
 * @param {string | null | undefined} atIso
 * @param {number} nowMs
 * @returns {string | null}
 */
export function relativeTime(atIso, nowMs) {
  if (!atIso) return null;
  const then = Date.parse(String(atIso));
  if (!Number.isFinite(then)) return null;
  const diffMs = nowMs - then;
  if (diffMs < 30_000) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Milliseconds since an ISO timestamp, or null when it cannot be read. */
function ageMs(value, nowMs) {
  if (!value) return null;
  const then = Date.parse(String(value));
  if (!Number.isFinite(then)) return null;
  return nowMs - then;
}

/**
 * Shape raw `agent_bus` rows into the trail the screen draws: last 30 minutes, newest
 * first, capped at `ACTIVITY_TRAIL_LIMIT`, each with a plain verb, a relative time and
 * whether the dot should brighten (under two minutes old).
 *
 * @param {Array<object> | null | undefined} busRows
 * @param {number} nowMs
 * @returns {{ items: object[], readable: boolean }}
 */
export function shapeActivityTrail(busRows, nowMs) {
  if (!Array.isArray(busRows)) return { items: [], readable: false };

  const items = busRows
    .map((row) => {
      const at = row?.created_at ?? null;
      const age = ageMs(at, nowMs);
      return { row, at, age };
    })
    .filter(({ age }) => age !== null && age >= 0 && age <= ACTIVITY_WINDOW_MS)
    .sort((a, b) => (a.age ?? 0) - (b.age ?? 0))
    .slice(0, ACTIVITY_TRAIL_LIMIT)
    .map(({ row, at, age }) => {
      const subject = typeof row?.subject === 'string' ? row.subject : '';
      const { verb, kind } = subjectToVerb(subject);
      return {
        at,
        from: String(row?.from_agent ?? '').trim() || 'An agent',
        to: row?.to_agent ? String(row.to_agent).trim() : null,
        subject,
        kind,
        verb,
        relative: relativeTime(at, nowMs),
        fresh: age !== null && age <= BUS_PULSE_WINDOW_MS,
      };
    });

  return { items, readable: true };
}

/**
 * Shape raw `nvg_agent_presence` rows into the per-agent presence list the route ships
 * alongside the trail (used for the working signal, per 4.3 of the spec — not rendered
 * directly, the trail rows carry the visible agent names).
 *
 * @param {Array<object> | null | undefined} presenceRows
 * @returns {{ items: object[], readable: boolean }}
 */
export function shapePresenceList(presenceRows) {
  if (!Array.isArray(presenceRows)) return { items: [], readable: false };

  const items = presenceRows
    .filter((row) => String(row?.agent_name ?? '').trim() !== '')
    .map((row) => ({
      agent: String(row.agent_name).trim(),
      status: String(row?.status ?? '').trim() || null,
      lastSeenAt: row?.last_seen_at ?? null,
    }));

  return { items, readable: true };
}

/**
 * Whether a bus row lands inside the two-minute pulse window — its own, independent
 * "agents working" signal alongside the presence-then-tickets precedence in
 * countAgentsWorking.
 *
 * @param {Array<object> | null | undefined} busRows
 * @param {number} nowMs
 * @returns {boolean}
 */
export function hasRecentBusPulse(busRows, nowMs) {
  if (!Array.isArray(busRows)) return false;
  return busRows.some((row) => {
    const age = ageMs(row?.created_at, nowMs);
    return age !== null && age >= 0 && age <= BUS_PULSE_WINDOW_MS;
  });
}

/**
 * The orb's working signal for step 4: a presence heartbeat within ten minutes (the
 * existing precedence — presence first, `agent_dispatch` as its fallback, unchanged) OR a
 * bus row within the last two minutes. Null only when every source is unreadable — that is
 * still "we do not know", never a guessed false.
 *
 * @param {{ presenceRows?: object[] | null, dispatchRows?: object[] | null, busRows?: object[] | null, nowMs: number }} input
 * @returns {boolean | null}
 */
export function resolveActivityWorking({ presenceRows = null, dispatchRows = null, busRows = null, nowMs }) {
  const { count, source } = countAgentsWorking(presenceRows, dispatchRows, nowMs);
  const pulse = hasRecentBusPulse(busRows, nowMs);

  if (count === null && !Array.isArray(busRows)) return null;
  return (count ?? 0) > 0 || pulse;
}

/**
 * Build the single object the activity route ships. Every input may be `null` — a source
 * that did not answer never becomes an empty list; the trail says "Not answering" instead
 * of reading as a quiet day nobody checked.
 *
 * @param {{ busRows?: object[] | null, presenceRows?: object[] | null, dispatchRows?: object[] | null, nowMs?: number }} input
 */
export function shapeFaceActivity(input = {}) {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const busRows = input.busRows ?? null;

  const trail = shapeActivityTrail(busRows, nowMs);
  const presence = shapePresenceList(input.presenceRows ?? null);
  const workingNow = resolveActivityWorking({
    presenceRows: input.presenceRows ?? null,
    dispatchRows: input.dispatchRows ?? null,
    busRows,
    nowMs,
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    trail,
    presence,
    workingNow,
  };
}

// Re-exported so callers of this module do not also need to import face-summary.mjs just
// to know the presence window step 4 still relies on.
export { WORKING_WINDOW_MS };
