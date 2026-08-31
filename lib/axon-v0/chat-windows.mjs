/**
 * AXON usability item #6 (multi-window agent chats) — pure state helpers for the
 * floating chat windows a venture room can have open at once.
 *
 * Deliberately plain, no-I/O, no-React code (same reasoning as checkLoopGuards in
 * lib/axon-agent-bus.mjs and scoreLanes in lib/axon-router-core.mjs): cheap and
 * deterministic to unit test, and importable straight into the .tsx component that
 * actually renders the windows without dragging any DOM/React dependency into the
 * test file.
 *
 * A "window" is one of:
 *   { kind: 'thread', ventureId, ventureName, thread, title }        — a popped-out
 *     saved chat, still reading/writing through the normal agent-chat thread.
 *   { kind: 'dispatch', ventureId, ventureName, dispatchId, title,
 *     state, reply, reason, route }                                  — a live
 *     cross-venture fireAgent() dispatch, tracked until it resolves.
 *
 * Run: node tests/chat-windows.test.mjs
 */

/** Bounds how many floating windows can be open at once. Not a UI nicety — every open
 *  window is its own poll/fetch loop in the browser, so this is the same "don't let an
 *  unattended thing pile up silently" reasoning as MAX_HOPS_PER_REQUEST in the agent bus. */
export const MAX_WINDOWS = 4;

/** Stable identity for a window — used to dedupe (popping out the same saved chat twice
 *  focuses the existing window instead of opening a second copy of it) and to close. */
export function windowKey(w) {
  if (!w) return '';
  if (w.kind === 'dispatch') return `dispatch:${w.dispatchId}`;
  return `thread:${w.ventureId}:${w.thread}`;
}

/**
 * Opens (or re-focuses) a window. Returns a NEW array — never mutates the one passed in,
 * so a React state setter can call this directly.
 *
 * - Already open: moved to the front (most-recently-focused) and merged with any new
 *   fields (e.g. re-opening a dispatch window with a fresher state), never duplicated.
 * - New, under the cap: appended.
 * - New, at the cap: the OLDEST window is evicted first (FIFO) to make room — an operator
 *   popping out chat after chat can't silently accumulate unbounded open windows.
 */
export function openWindow(windows, win) {
  const list = Array.isArray(windows) ? windows : [];
  const key = windowKey(win);
  const existingIdx = list.findIndex((w) => windowKey(w) === key);
  if (existingIdx !== -1) {
    const merged = { ...list[existingIdx], ...win };
    return [...list.slice(0, existingIdx), ...list.slice(existingIdx + 1), merged];
  }
  const next = [...list, win];
  if (next.length <= MAX_WINDOWS) return next;
  return next.slice(next.length - MAX_WINDOWS);
}

/** Closes a window by key. A no-op (same array contents) if that key isn't open. */
export function closeWindow(windows, key) {
  const list = Array.isArray(windows) ? windows : [];
  return list.filter((w) => windowKey(w) !== key);
}

/** Patches one open window in place (by key) — used to move a dispatch window through
 *  dispatched -> running -> completed/timeout/failed as the fireAgent() call resolves.
 *  A no-op if that key isn't open (e.g. the operator closed it before the reply landed). */
export function patchWindow(windows, key, patch) {
  const list = Array.isArray(windows) ? windows : [];
  return list.map((w) => (windowKey(w) === key ? { ...w, ...patch } : w));
}
