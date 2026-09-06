/**
 * THE FACE — pure helpers shared by the hero and the orb scene.
 *
 * Deliberately free of React, Three.js, `window` and `document` so it can be unit-tested
 * offline with `node --test` (tests/face-signal.test.mjs) and imported from both a client
 * component and a plain script. Anything added here must stay a pure function.
 */

/** Milliseconds the mock signal stays resting, then working, before repeating. */
export const REST_MS = 5200;
export const WORK_MS = 4200;

/** Longest frame delta the orb will integrate, in seconds. Caps catch-up after a stall. */
export const MAX_FRAME_DELTA_S = 0.05;

/** Hard ceiling on device pixel ratio — retina is worth it, 3x on a 4K panel is not. */
export const MAX_PIXEL_RATIO = 2;

/** Window (ms) a burst of resize events is collapsed into before the canvas resizes. */
export const RESIZE_THROTTLE_MS = 120;

/**
 * Read the `?working=` pin out of a query string.
 * Returns true (pinned working), false (pinned resting) or null (no pin — run the mock).
 * Accepts a raw search string with or without the leading `?`.
 *
 * @param {string} search
 * @returns {boolean | null}
 */
export function resolveForcedWorking(search) {
  if (typeof search !== 'string' || search === '') return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('working');
  if (raw === null) return null;
  return raw !== '0' && raw !== 'false';
}

/**
 * How long the mock signal holds the state it just moved into.
 * @param {boolean} working
 * @returns {number}
 */
export function nextSwingDelay(working) {
  return working ? WORK_MS : REST_MS;
}

/**
 * Frame budget: turn two `performance.now()` readings into a delta in seconds, never
 * negative and never longer than one twentieth of a second — so a tab that was hidden for
 * a minute does not come back and jump the animation forward by a minute.
 *
 * @param {number} nowMs
 * @param {number} lastMs
 * @returns {number}
 */
export function clampFrameDelta(nowMs, lastMs) {
  const delta = (Number(nowMs) - Number(lastMs)) / 1000;
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return Math.min(delta, MAX_FRAME_DELTA_S);
}

/**
 * Device pixel ratio actually handed to the renderer.
 * @param {number} ratio
 * @returns {number}
 */
export function cappedPixelRatio(ratio) {
  const value = Number(ratio);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, MAX_PIXEL_RATIO);
}
