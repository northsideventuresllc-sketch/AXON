#!/usr/bin/env node
/**
 * Proves lib/axon-droid-live-view.mjs's upsert/get pair hits the expected PostgREST shape
 * (merge-duplicates upsert on run_id, plain select-by-run_id) and that a live-view write
 * failure never throws — runComputerUseTask must not fail a real task just because the
 * observability side-channel is down.
 *
 * No live Supabase call: global.fetch is stubbed, same pattern as
 * tests/router-computer-use-lane.test.mjs.
 *
 * Run: node tests/axon-droid-live-view.test.mjs
 */
import assert from 'node:assert/strict';
import { upsertLiveFrame, getLiveFrame } from '../lib/axon-droid-live-view.mjs';

const FAKE_KEY = 'fake-supabase-key-live-view-test';

// --- 1. upsertLiveFrame POSTs to axon_droid_live_frames with a merge-duplicates upsert,
//        carrying run_id + the patch fields ------------------------------------------------
{
  let captured;
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    captured = { url: String(url), opts };
    return { ok: true, json: async () => true };
  };
  try {
    const ok = await upsertLiveFrame(FAKE_KEY, 'run-123', { status: 'running', step: 2 });
    assert.equal(ok, true);
  } finally {
    global.fetch = originalFetch;
  }
  assert.match(captured.url, /\/axon_droid_live_frames$/);
  assert.equal(captured.opts.method, 'POST');
  assert.match(captured.opts.headers.Prefer, /resolution=merge-duplicates/);
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.run_id, 'run-123');
  assert.equal(body.status, 'running');
  assert.equal(body.step, 2);
  assert.equal(typeof body.updated_at, 'string');
}

// --- 2. upsertLiveFrame swallows a failed write instead of throwing ------------------------
{
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'db down' });
  try {
    const ok = await upsertLiveFrame(FAKE_KEY, 'run-123', { status: 'error' });
    assert.equal(ok, false);
  } finally {
    global.fetch = originalFetch;
  }
}

// --- 3. getLiveFrame selects by run_id and returns the first row, or null when none exists -
{
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /\/axon_droid_live_frames\?run_id=eq\.run-123&limit=1$/);
    return { ok: true, json: async () => [{ run_id: 'run-123', step: 2 }] };
  };
  try {
    const row = await getLiveFrame(FAKE_KEY, 'run-123');
    assert.deepEqual(row, { run_id: 'run-123', step: 2 });
  } finally {
    global.fetch = originalFetch;
  }

  global.fetch = async () => ({ ok: true, json: async () => [] });
  try {
    const row = await getLiveFrame(FAKE_KEY, 'run-missing');
    assert.equal(row, null);
  } finally {
    global.fetch = originalFetch;
  }
}

console.log('axon-droid-live-view.test.mjs OK');
