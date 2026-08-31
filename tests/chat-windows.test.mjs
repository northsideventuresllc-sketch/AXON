#!/usr/bin/env node
/**
 * AXON usability item #6 (multi-window agent chats) — proves the pure window-state
 * helpers behave: open/dedupe/focus, the MAX_WINDOWS eviction cap, close, and patch.
 * Pure, no I/O, no Supabase key needed — same reasoning as
 * tests/agent-bus-loop-guards.test.mjs.
 *
 * Run: node tests/chat-windows.test.mjs
 */
import assert from 'node:assert/strict';
import { MAX_WINDOWS, closeWindow, openWindow, patchWindow, windowKey } from '../lib/axon-v0/chat-windows.mjs';

// --- 1. opening a fresh window appends it -----------------------------------------------
{
  const w1 = { kind: 'thread', ventureId: 'v1', thread: 'group', title: 'Venture room' };
  const windows = openWindow([], w1);
  assert.equal(windows.length, 1, 'opening one window on an empty list yields one window');
  assert.equal(windows[0].title, 'Venture room');
}

// --- 2. re-opening the same thread window dedupes instead of stacking a duplicate -------
{
  const w1 = { kind: 'thread', ventureId: 'v1', thread: 'sub:abc', title: 'Old title' };
  const w1Again = { kind: 'thread', ventureId: 'v1', thread: 'sub:abc', title: 'New title' };
  const windows = openWindow(openWindow([], w1), w1Again);
  assert.equal(windows.length, 1, 'opening the same thread twice must not duplicate the window');
  assert.equal(windows[0].title, 'New title', 'the merge must pick up the newer fields');
}

// --- 3. two different threads in the same venture are both open at once (the actual ------
//        "multi-window" behavior — not just one active thread replacing another) ---------
{
  const windows = openWindow(
    openWindow([], { kind: 'thread', ventureId: 'v1', thread: 'group', title: 'A' }),
    { kind: 'thread', ventureId: 'v1', thread: 'sub:xyz', title: 'B' }
  );
  assert.equal(windows.length, 2, 'two distinct threads must both stay open as separate windows');
}

// --- 4. the MAX_WINDOWS cap evicts the oldest window, FIFO, never silently drops the ------
//        one just opened -----------------------------------------------------------------
{
  let windows = [];
  for (let i = 0; i < MAX_WINDOWS + 2; i++) {
    windows = openWindow(windows, { kind: 'thread', ventureId: 'v1', thread: `t${i}`, title: `#${i}` });
  }
  assert.equal(windows.length, MAX_WINDOWS, `window count must never exceed MAX_WINDOWS (${MAX_WINDOWS})`);
  assert.ok(
    windows.some((w) => w.title === `#${MAX_WINDOWS + 1}`),
    'the window just opened must survive the eviction, not be the one dropped'
  );
  assert.ok(!windows.some((w) => w.title === '#0'), 'the oldest window must be the one evicted (FIFO)');
}

// --- 5. closeWindow removes exactly the targeted window and nothing else -----------------
{
  const a = { kind: 'thread', ventureId: 'v1', thread: 'group', title: 'A' };
  const b = { kind: 'dispatch', ventureId: 'v2', dispatchId: 'd1', title: 'B' };
  const windows = closeWindow(openWindow(openWindow([], a), b), windowKey(a));
  assert.equal(windows.length, 1, 'closing one window must leave the other open');
  assert.equal(windows[0].dispatchId, 'd1');
}

// --- 6. patchWindow evolves a dispatch window's progress state in place ------------------
{
  const dispatch = { kind: 'dispatch', ventureId: 'v2', dispatchId: 'd1', title: 'B', state: 'dispatched' };
  let windows = openWindow([], dispatch);
  windows = patchWindow(windows, windowKey(dispatch), { state: 'running' });
  assert.equal(windows[0].state, 'running', 'patchWindow must update the matched window');
  windows = patchWindow(windows, 'dispatch:not-open', { state: 'completed' });
  assert.equal(windows[0].state, 'running', 'patchWindow must be a no-op for a key that is not open');
}

console.log('chat-windows: all checks passed');
