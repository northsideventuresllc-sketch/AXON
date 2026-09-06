#!/usr/bin/env node
/**
 * THE FACE — unit tests for the pure parts of the hero: the `?working=` pin, the mock
 * swing timing, the frame budget and the pixel-ratio cap.
 *
 * Everything under test lives in lib/axon-v0/face-signal.mjs and touches no browser API,
 * so this runs offline with no network, no DOM and no Supabase key.
 *
 * Run: node tests/face-signal.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_FRAME_DELTA_S,
  MAX_PIXEL_RATIO,
  REST_MS,
  WORK_MS,
  cappedPixelRatio,
  clampFrameDelta,
  nextSwingDelay,
  resolveForcedWorking,
} from '../lib/axon-v0/face-signal.mjs';

test('?working pins the state and anything else leaves the mock alone', () => {
  assert.equal(resolveForcedWorking('?working=1'), true, 'working=1 pins working');
  assert.equal(resolveForcedWorking('working=1'), true, 'leading ? is optional');
  assert.equal(resolveForcedWorking('?working=true'), true);
  assert.equal(resolveForcedWorking('?working='), true, 'a bare pin still means working');

  assert.equal(resolveForcedWorking('?working=0'), false, 'working=0 pins resting');
  assert.equal(resolveForcedWorking('?working=false'), false);

  assert.equal(resolveForcedWorking(''), null, 'no query string means no pin');
  assert.equal(resolveForcedWorking('?tab=deck'), null, 'an unrelated param is not a pin');
  assert.equal(resolveForcedWorking(undefined), null, 'server render has no search string');
  assert.equal(resolveForcedWorking(null), null);
});

test('the pin survives other query params, in either order', () => {
  assert.equal(resolveForcedWorking('?tab=deck&working=0'), false);
  assert.equal(resolveForcedWorking('?working=1&tab=deck'), true);
});

test('the mock swing holds working and resting for their own spans', () => {
  assert.equal(nextSwingDelay(true), WORK_MS);
  assert.equal(nextSwingDelay(false), REST_MS);
  assert.ok(REST_MS > 0 && WORK_MS > 0, 'both spans must be real waits');
});

test('frame budget: a normal frame passes through, a stall is capped', () => {
  // 16.7ms — one frame at 60fps.
  assert.ok(Math.abs(clampFrameDelta(1016.7, 1000) - 0.0167) < 1e-9, '60fps frame is exact');

  // A tab hidden for two minutes must not integrate two minutes on the way back.
  assert.equal(clampFrameDelta(121000, 1000), MAX_FRAME_DELTA_S, 'long stall is clamped');
  assert.equal(clampFrameDelta(1051, 1000), MAX_FRAME_DELTA_S, 'just over the cap is clamped');
  assert.equal(MAX_FRAME_DELTA_S, 0.05, 'cap is one twentieth of a second');
});

test('frame budget: a clock that goes backwards or blank yields zero, never NaN', () => {
  assert.equal(clampFrameDelta(1000, 2000), 0, 'negative delta is floored at zero');
  assert.equal(clampFrameDelta(1000, 1000), 0, 'same reading twice is a zero-length frame');
  assert.equal(clampFrameDelta(Number.NaN, 1000), 0);
  assert.equal(clampFrameDelta(1000, undefined), 0);
});

test('device pixel ratio is capped at 2 and never drops below 1', () => {
  assert.equal(MAX_PIXEL_RATIO, 2, 'the cap itself is 2');
  assert.equal(cappedPixelRatio(1), 1, 'a plain display is untouched');
  assert.equal(cappedPixelRatio(1.75), 1.75, 'a fractional ratio under the cap is untouched');
  assert.equal(cappedPixelRatio(2), 2);
  assert.equal(cappedPixelRatio(3), 2, 'a 3x panel is capped');
  assert.equal(cappedPixelRatio(0.5), 1, 'a sub-1 ratio still renders at 1');
  assert.equal(cappedPixelRatio(undefined), 1, 'a missing devicePixelRatio falls back to 1');
  assert.equal(cappedPixelRatio(Number.NaN), 1);
});
