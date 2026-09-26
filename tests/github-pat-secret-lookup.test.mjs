#!/usr/bin/env node
/**
 * Learning #10379 — ni_platform_secrets has held duplicate rows under the same
 * key name (a live Stripe sk_live_... key mis-stored under 'GH_PAT' alongside the
 * real ghp_... token). A single-row eq.GH_PAT lookup with no ordering can surface
 * whichever row Postgres/PostgREST returns first, handing back a non-GitHub secret.
 * resolveGithubPat() must scan all rows for a key and only accept a value that
 * actually looks like a GitHub token.
 *
 * No real network: global.fetch is mocked, same pattern as tests/mcp-connections.test.mjs.
 *
 * Run: node tests/github-pat-secret-lookup.test.mjs
 */
import assert from 'node:assert/strict';
import { resolveGithubPat, looksLikeGithubToken } from '../lib/github-pat.mjs';

const ENV_KEYS = ['AXON_GITHUB_PAT', 'GITHUB_PAT', 'GH_PAT', 'NI_GITHUB_PAT', 'GITHUB_TOKEN'];
const SERVICE_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'];

function clearEnv() {
  for (const k of [...ENV_KEYS, ...SERVICE_KEYS]) delete process.env[k];
}

// --- looksLikeGithubToken: format validation ------------------------------------------
{
  assert.equal(looksLikeGithubToken('ghp_abc123'), true);
  assert.equal(looksLikeGithubToken('github_pat_abc123'), true);
  assert.equal(looksLikeGithubToken('other-service-secret-abc123'), false, 'a non-GitHub secret must never validate as a GitHub token');
  assert.equal(looksLikeGithubToken(''), false);
  assert.equal(looksLikeGithubToken(undefined), false);
}

// --- resolveGithubPat: duplicate rows under the same key, Stripe key returned first ---
{
  clearEnv();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  global.fetch = async (url) => {
    assert.ok(String(url).includes('key=eq.GH_PAT'));
    assert.ok(!String(url).includes('limit=1'), 'must not cap to a single row when the key can be duplicated');
    return {
      ok: true,
      json: async () => [
        { value: 'other-service-secret-stored-under-the-wrong-key-name' },
        { value: 'ghp_therealgithubtoken' },
      ],
    };
  };

  const pat = await resolveGithubPat();
  assert.equal(pat, 'ghp_therealgithubtoken', 'must skip the mis-stored non-GitHub row and return the real GitHub token');

  clearEnv();
  delete global.fetch;
}

// --- resolveGithubPat: no row under any key looks like a real token -> empty string ---
{
  clearEnv();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  global.fetch = async () => ({
    ok: true,
    json: async () => [{ value: 'other-service-secret-only-bad-row-here' }],
  });

  const pat = await resolveGithubPat();
  assert.equal(pat, '', 'must not return a non-GitHub secret even if it is the only row found');

  clearEnv();
  delete global.fetch;
}

console.log('github-pat-secret-lookup.test.mjs: all assertions passed');
