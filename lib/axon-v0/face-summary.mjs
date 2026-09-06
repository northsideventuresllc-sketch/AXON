/**
 * THE FACE — pure shaping for the home-screen summary (Build Plan B, step 2).
 *
 * Everything here is a pure function over plain rows: no React, no `window`, no Supabase,
 * no `fetch`. The route (app/api/axon-v0/face/summary/route.ts) does the reading, hands the
 * rows in here, and ships the result. That keeps the whole shaping layer testable offline
 * with `node --test` (tests/face-summary.test.mjs) and with no database credentials.
 *
 * House rule that governs every function below: a number we could not read is `null`, never
 * a zero and never a guess. `null` is what makes the card render "No data yet" instead of a
 * confident wrong figure.
 */

/** How recent a heartbeat has to be for an agent to count as working right now. */
export const WORKING_WINDOW_MS = 10 * 60 * 1000;

/** How far back the leads card counts. */
export const LEADS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dispatch statuses that mean the ticket is finished with, one way or another.
 * `skipped` counts as closed alongside `done` and `rejected`: a skipped ticket was
 * deliberately closed out without being run, so counting it as open would put a
 * misleadingly large number on the home screen.
 */
export const CLOSED_TICKET_STATUSES = new Set(['done', 'rejected', 'skipped']);

/** Presence statuses that mean the agent is checked in but not doing anything. */
const RESTING_PRESENCE_STATUSES = new Set(['idle', 'closed', 'done', 'offline']);

/** Dispatch statuses that mean the ticket is being worked on right now. */
const IN_FLIGHT_TICKET_STATUSES = new Set(['running', 'in_progress', 'claimed', 'dispatched']);

/** Health values that mean the row is shelved rather than run. */
const ARCHIVED_HEALTH = new Set(['archived', 'retired', 'dormant']);

/** Health values that mean somebody needs to look at it. */
const ATTENTION_HEALTH = new Set([
  'degraded',
  'down',
  'error',
  'failing',
  'unhealthy',
  'critical',
  'red',
  'warning',
]);

/** Health values that mean it has gone quiet without failing. */
const QUIET_HEALTH = new Set(['stale', 'quiet', 'idle']);

/**
 * Plain words for a roster row's raw health. Never a status code on screen.
 *
 *  - **On track** — running and healthy
 *  - **Quiet** — alive but has not checked in lately
 *  - **Needs attention** — degraded or failing
 *  - **Off** — dormant, retired, or archived
 *
 * @param {{ active?: boolean, health_status?: string | null, retired_at?: string | null }} row
 * @returns {'On track' | 'Quiet' | 'Needs attention' | 'Off'}
 */
export function plainModuleHealth(row) {
  const health = String(row?.health_status ?? '').toLowerCase().trim();
  if (!row?.active || row?.retired_at || ARCHIVED_HEALTH.has(health)) return 'Off';
  if (ATTENTION_HEALTH.has(health)) return 'Needs attention';
  if (QUIET_HEALTH.has(health)) return 'Quiet';
  if (health === 'healthy' || health === 'ok' || health === 'green') return 'On track';
  // An active row with a health value we do not recognise is not "fine" — say it is quiet
  // rather than claiming it is on track.
  return 'Quiet';
}

/** True when a roster row belongs in the LIVE group rather than PLANNED. */
export function isLiveModule(row) {
  return plainModuleHealth(row) !== 'Off';
}

/**
 * One roster row reduced to what the module list draws. Plain-English names as stored —
 * the roster's own `agent_name`, never a re-worded one.
 */
export function toModule(row) {
  const name = String(row?.agent_name ?? '').trim();
  const summary = typeof row?.function_summary === 'string' ? row.function_summary.trim() : '';
  return {
    name: name || 'Unnamed agent',
    summary: summary || null,
    health: plainModuleHealth(row),
    live: isLiveModule(row),
  };
}

/**
 * Split the roster into LIVE and PLANNED, each sorted by name. Rows without a name are
 * dropped rather than drawn as a blank line.
 *
 * @param {Array<object> | null | undefined} rows
 * @returns {{ live: object[], planned: object[] }}
 */
export function groupModules(rows) {
  const modules = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.agent_name ?? '').trim() !== '')
    .map(toModule)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    live: modules.filter((m) => m.live),
    planned: modules.filter((m) => !m.live),
  };
}

/** Milliseconds since an ISO timestamp, or null when it cannot be read. */
function ageMs(value, nowMs) {
  if (!value) return null;
  const then = Date.parse(String(value));
  if (!Number.isFinite(then)) return null;
  return nowMs - then;
}

/**
 * How many agents are working right now, and which signal it came from.
 *
 * Preferred source is `nvg_agent_presence` — it carries `last_seen_at`, so a heartbeat
 * inside the last ten minutes on a row that is not resting counts as work in progress.
 * If that read failed (rows === null) we fall back to `agent_dispatch` rows sitting in an
 * in-flight status that were touched in the same ten-minute window. Callers surface which
 * one was used; nothing here ever guesses a number.
 *
 * @returns {{ count: number | null, source: 'presence' | 'tickets' | 'none' }}
 */
export function countAgentsWorking(presenceRows, dispatchRows, nowMs) {
  if (Array.isArray(presenceRows)) {
    const count = presenceRows.filter((row) => {
      const age = ageMs(row?.last_seen_at, nowMs);
      if (age === null || age < 0 || age > WORKING_WINDOW_MS) return false;
      return !RESTING_PRESENCE_STATUSES.has(String(row?.status ?? '').toLowerCase().trim());
    }).length;
    return { count, source: 'presence' };
  }

  if (Array.isArray(dispatchRows)) {
    const count = dispatchRows.filter((row) => {
      if (!IN_FLIGHT_TICKET_STATUSES.has(String(row?.status ?? '').toLowerCase().trim())) {
        return false;
      }
      const age = ageMs(row?.updated_at ?? row?.fired_at ?? row?.claimed_at, nowMs);
      return age !== null && age >= 0 && age <= WORKING_WINDOW_MS;
    }).length;
    return { count, source: 'tickets' };
  }

  return { count: null, source: 'none' };
}

/**
 * Read an exact row count out of a PostgREST `Content-Range` header.
 *
 * The header looks like `0-24/3573`, or `* /0` when the range is empty, or `0-24/ *` when the
 * count was not asked for. Only a real total comes back as a number; anything else is null,
 * which the card renders as its empty state rather than as a zero.
 *
 * @param {string | null | undefined} header
 * @returns {number | null}
 */
export function parseExactCount(header) {
  if (typeof header !== 'string') return null;
  const total = header.split('/')[1];
  if (total === undefined) return null;
  const trimmed = total.trim();
  if (trimmed === '' || trimmed === '*') return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * What one poll tick should do. Kept pure so the hook's awkward cases are testable offline
 * without a DOM: a component that mounts in a hidden tab must still settle its loading
 * state, or every card sits on "Reading…" until the tab is next looked at.
 *
 * @param {{ hidden?: boolean, inFlight?: boolean }} state
 * @returns {{ fetch: boolean, settleLoading: boolean }}
 */
export function planFaceFetch(state = {}) {
  // A request is already out — let it finish and settle the loading state itself.
  if (state.inFlight) return { fetch: false, settleLoading: false };
  // Hidden tab: do not spend a request, but stop claiming to be reading.
  if (state.hidden) return { fetch: false, settleLoading: true };
  return { fetch: true, settleLoading: false };
}

/** Tickets still open — anything not done, rejected or skipped. Null when unreadable. */
export function countOpenTickets(dispatchRows) {
  if (!Array.isArray(dispatchRows)) return null;
  return dispatchRows.filter(
    (row) => !CLOSED_TICKET_STATUSES.has(String(row?.status ?? '').toLowerCase().trim())
  ).length;
}

/** Leads created in the last seven days. Null when unreadable. */
export function countLeadsThisWeek(leadRows, nowMs) {
  if (!Array.isArray(leadRows)) return null;
  return leadRows.filter((row) => {
    const age = ageMs(row?.created_at, nowMs);
    return age !== null && age >= 0 && age <= LEADS_WINDOW_MS;
  }).length;
}

/** Roster rows that are live right now. Null when the roster could not be read. */
export function countAgentsLive(rosterRows) {
  if (!Array.isArray(rosterRows)) return null;
  return rosterRows.filter(isLiveModule).length;
}

/**
 * Build the single object the whole home screen reads.
 *
 * Every input may be `null`, meaning "that source did not answer". Nothing is invented to
 * fill a gap: an unread source becomes a `null` number and a designed empty state on the
 * card. Called with nothing at all this still returns a complete, well-formed object.
 *
 * `openTicketsCount` is the exact head-count read straight from the queue (see
 * lib/axon-v0/face-reads.ts) — pass it and it wins, because counting a capped page of rows
 * would silently undercount once the queue grows past that page. Leave it out and the count
 * falls back to counting whatever dispatch rows were handed in.
 *
 * @param {{
 *   rosterRows?: object[] | null,
 *   presenceRows?: object[] | null,
 *   dispatchRows?: object[] | null,
 *   openTicketsCount?: number | null,
 *   leadRows?: object[] | null,
 *   nowMs?: number,
 * }} input
 */
export function shapeFaceSummary(input = {}) {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const rosterRows = input.rosterRows ?? null;
  const dispatchRows = input.dispatchRows ?? null;

  const working = countAgentsWorking(input.presenceRows ?? null, dispatchRows, nowMs);
  const groups = groupModules(rosterRows);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    agentsLive: countAgentsLive(rosterRows),
    agentsWorking: working.count,
    workingSource: working.source,
    openTickets:
      input.openTicketsCount === undefined
        ? countOpenTickets(dispatchRows)
        : (input.openTicketsCount ?? null),
    leadsThisWeek: countLeadsThisWeek(input.leadRows ?? null, nowMs),
    // Finance is dormant, so there is no revenue number to read. It ships as a designed
    // empty state and stays null until Finance is actually connected.
    revenue: null,
    modules: {
      live: groups.live,
      planned: groups.planned,
      total: groups.live.length + groups.planned.length,
      readable: Array.isArray(rosterRows),
    },
  };
}
