/**
 * B6 — pure grouping logic for the Dash To-Do page. Splits `nvg_rolling_tasks` rows
 * into the two LOCKED table shapes from nv-vault's `rolling-todo` skill (Repeating:
 * daily then weekly Mon–Fri; Non-repeating: open items + monthly-due-today + completed)
 * and maps `agent_dispatch` rows into the 3-column Queue. Deliberately plain, no-I/O
 * (same reasoning as chat-windows.mjs / axon-router-core.mjs scoreLanes): cheap and
 * deterministic to unit test, importable straight into the API route and the page.
 *
 * Run: node tests/todo-grouping.test.mjs
 */

/** ISO weekday (Mon=1 ... Sun=7), same convention as nvg_rolling_tasks.day_of_week. */
export function isoWeekday(date) {
  const d = date instanceof Date ? date : new Date(date);
  const js = d.getDay(); // Sun=0..Sat=6
  return js === 0 ? 7 : js;
}

/**
 * Splits raw `nvg_rolling_tasks` rows into Repeating (daily block first, then every
 * weekly row for the whole Mon-Fri week, grouped in weekday order) and Non-repeating
 * (open + monthly-due-today + completed) groups. `agentic_question` rows are out of
 * scope for this LOCKED format (not a task the skill's three surfaces cover) and are
 * silently excluded, never merged in.
 *
 * @param {Array<object>} rows - nvg_rolling_tasks rows
 * @param {{ dayOfWeek?: number, dayOfMonth?: number }} [today]
 */
export function groupRollingTasks(rows, today = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const dom = Number.isInteger(today.dayOfMonth) ? today.dayOfMonth : new Date().getDate();

  const dailyRepeating = list.filter(
    (r) => r && r.task_type === 'recurring' && r.cadence === 'daily'
  );
  // Every weekday row (Mon=1..Fri=5), not just today's — the skill's locked table
  // shows the whole working week, grouped Mon->Fri, weekend (6/7) rows excluded.
  const weeklyRepeating = list
    .filter(
      (r) =>
        r &&
        r.task_type === 'recurring' &&
        r.cadence === 'weekly' &&
        Number(r.day_of_week) >= 1 &&
        Number(r.day_of_week) <= 5
    )
    .sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week));
  // Daily block first, then weekly Mon-Fri — matches the skill's locked table order.
  const repeating = [...dailyRepeating, ...weeklyRepeating];

  const nonRepeatingOpen = list.filter((r) => r && r.task_type === 'non_repeating' && !r.done);
  const nonRepeatingDone = list.filter((r) => r && r.task_type === 'non_repeating' && r.done);
  const monthlyDueToday = list.filter(
    (r) =>
      r &&
      r.task_type === 'recurring' &&
      r.cadence === 'monthly' &&
      Number(r.day_of_month) === dom
  );
  // Open items, then monthly-due-today, then completed (kept visible per the skill).
  const nonRepeating = [...nonRepeatingOpen, ...monthlyDueToday, ...nonRepeatingDone];

  return { repeating, nonRepeating };
}

const QUEUE_STATUS_LABELS = {
  queued: 'Queued',
  needs_context: 'Needs more context',
  needs_jb: 'Needs your call',
  blocked: 'Blocked',
  done: 'Done',
  skipped: 'Skipped',
  rejected: 'Rejected',
};

/** Plain-English label for an agent_dispatch row's raw `status` — never the raw
 *  code on screen. Unknown values fall back to a de-underscored, capitalized guess
 *  rather than shouting the raw slug. */
export function plainQueueStatus(status) {
  const key = String(status || '').toLowerCase().trim();
  if (!key) return 'Unknown';
  if (QUEUE_STATUS_LABELS[key]) return QUEUE_STATUS_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Maps raw `agent_dispatch` rows to the Queue table's 3 columns: Code | What | Status.
 * Keeps recently-done rows visible (per the skill: "Include ✅ recently done") —
 * callers pass an already-limited/ordered row set; this only shapes each row.
 */
export function buildQueueRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((r) => r && r.code)
    .map((r) => ({
      code: r.code,
      what: r.title || r.dispatch_phrase || r.code,
      status: plainQueueStatus(r.status),
      done: r.status === 'done',
    }));
}
