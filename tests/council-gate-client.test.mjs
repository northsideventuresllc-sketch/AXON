#!/usr/bin/env node
/**
 * council-gate-client-core.mjs — the door non-merging AXON code paths use to
 * reach COUNCIL GATE (Decision #2029) instead of merging a PR themselves.
 * global.fetch mocked — same mocking shape as tests/roster-fire-decision.test.mjs.
 *
 * Run: node --test tests/council-gate-client.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestCouncilGateReview,
  getSupabaseUrl,
  getServiceKey,
} from '../lib/council-gate-client-core.mjs';

const json = (v, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => v,
  text: async () => JSON.stringify(v),
});

const savedEnv = { ...process.env };
function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
}

test('getSupabaseUrl defaults to the NI-Brain project when no env set', () => {
  resetEnv();
  delete process.env.NI_BRAIN_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  assert.equal(getSupabaseUrl(), 'https://kxijunwgbrlfzvgkhklo.supabase.co');
});

test('getSupabaseUrl: NI_BRAIN_SUPABASE_URL wins over SUPABASE_URL', () => {
  resetEnv();
  process.env.NI_BRAIN_SUPABASE_URL = 'https://example-a.supabase.co';
  process.env.SUPABASE_URL = 'https://example-b.supabase.co';
  assert.equal(getSupabaseUrl(), 'https://example-a.supabase.co');
  resetEnv();
});

test('getServiceKey: SUPABASE_SERVICE_KEY wins over ROLE_KEY', () => {
  resetEnv();
  process.env.SUPABASE_SERVICE_KEY = 'key-a';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key-b';
  assert.equal(getServiceKey(), 'key-a');
  resetEnv();
});

test('requestCouncilGateReview: happy path posts correct RPC payload', async () => {
  resetEnv();
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  let capturedUrl, capturedOpts;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return json({ ticket: 'W2-GATE-AXON-42' });
  };
  const result = await requestCouncilGateReview({
    repo: 'AXON',
    pr: 42,
    requester: 'axon-executive-agent',
    summary: 'ship feature X',
    headSha: 'deadbeef',
    fetchImpl,
  });
  assert.equal(
    capturedUrl,
    'https://kxijunwgbrlfzvgkhklo.supabase.co/rest/v1/rpc/fn_request_council_gate_review',
  );
  assert.equal(capturedOpts.method, 'POST');
  assert.equal(capturedOpts.headers.apikey, 'test-key');
  assert.equal(capturedOpts.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(capturedOpts.body);
  assert.deepEqual(body, {
    p_repo: 'AXON',
    p_pr: 42,
    p_requester: 'axon-executive-agent',
    p_summary: 'ship feature X',
    p_head_sha: 'deadbeef',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ticket, { ticket: 'W2-GATE-AXON-42' });
  resetEnv();
});

test('requestCouncilGateReview: pr coerced to Number', async () => {
  resetEnv();
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  let captured;
  const fetchImpl = async (_url, opts) => {
    captured = JSON.parse(opts.body);
    return json({ ok: true });
  };
  await requestCouncilGateReview({ repo: 'nv-vault', pr: '17', requester: 'r', fetchImpl });
  assert.equal(captured.p_pr, 17);
  assert.equal(typeof captured.p_pr, 'number');
  resetEnv();
});

test('requestCouncilGateReview: missing required args throw', async () => {
  resetEnv();
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  await assert.rejects(() => requestCouncilGateReview({ pr: 1, requester: 'r' }), /repo is required/);
  await assert.rejects(() => requestCouncilGateReview({ repo: 'AXON', requester: 'r' }), /pr is required/);
  await assert.rejects(() => requestCouncilGateReview({ repo: 'AXON', pr: 1 }), /requester is required/);
  resetEnv();
});

test('requestCouncilGateReview: missing service key throws, never fetches', async () => {
  resetEnv();
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return json({});
  };
  await assert.rejects(
    () => requestCouncilGateReview({ repo: 'AXON', pr: 1, requester: 'r', fetchImpl }),
    /no service key set/,
  );
  assert.equal(called, false);
  resetEnv();
});

test('requestCouncilGateReview: non-ok HTTP response throws', async () => {
  resetEnv();
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  const fetchImpl = async () => json({ message: 'denied' }, 403);
  await assert.rejects(
    () => requestCouncilGateReview({ repo: 'AXON', pr: 1, requester: 'r', fetchImpl }),
    /HTTP 403/,
  );
  resetEnv();
});
