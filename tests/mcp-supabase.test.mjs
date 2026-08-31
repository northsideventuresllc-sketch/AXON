#!/usr/bin/env node
/**
 * Problem #9 (MCP build system) — Supabase wiring's pure logic.
 *
 * hasSupabaseMcpKey / describeSupabaseMcpState / supabaseMcpRegistryRow are
 * deliberately pure (no network, no real env) so this file is cheap and
 * needs no live Supabase key to run. See tests/skill-guard.test.mjs for the
 * sibling pattern this follows.
 *
 * Run: node tests/mcp-supabase.test.mjs
 */
import assert from 'node:assert/strict';
import {
  hasSupabaseMcpKey,
  describeSupabaseMcpState,
  supabaseMcpRegistryRow,
  SUPABASE_MCP_KEY_ENV_VARS,
} from '../lib/axon-v0/mcp-supabase.mjs';

// --- 1. no key present at all -------------------------------------------------------------
{
  const has = hasSupabaseMcpKey({});
  assert.equal(has, false, 'an empty env must report no key present');
}

// --- 2. either accepted env var name counts as present ------------------------------------
for (const name of SUPABASE_MCP_KEY_ENV_VARS) {
  const has = hasSupabaseMcpKey({ [name]: 'sk_live_not_a_real_value' });
  assert.equal(has, true, `${name} alone must count as a key being present`);
}

// --- 3. a blank/whitespace-only value does not count as present ---------------------------
{
  const has = hasSupabaseMcpKey({ SUPABASE_SERVICE_ROLE_KEY: '   ' });
  assert.equal(has, false, 'whitespace-only value must not count as a key');
}

// --- 4. no key -> needs_key state, never mentions "connected" -----------------------------
{
  const state = describeSupabaseMcpState({ hasKey: false });
  assert.equal(state.connected, false);
  assert.equal(state.status, 'needs_key');
  assert.equal(state.label, 'Needs a key');
  assert.match(state.detail, /key/i);
}

// --- 5. key present + verified -> connected ------------------------------------------------
{
  const state = describeSupabaseMcpState({ hasKey: true, verified: true });
  assert.equal(state.connected, true);
  assert.equal(state.status, 'connected');
  assert.equal(state.label, 'Connected');
}

// --- 6. key present but live check failed -> check_failed, NOT connected ------------------
{
  const state = describeSupabaseMcpState({ hasKey: true, verified: false });
  assert.equal(state.connected, false, 'a key on file with a failed live check must not read as connected');
  assert.equal(state.status, 'check_failed');
}

// --- 7. the state object never carries a raw secret-shaped value --------------------------
{
  const state = describeSupabaseMcpState({ hasKey: true, verified: true });
  const dump = JSON.stringify(state);
  assert.doesNotMatch(dump, /sk_live|service_role|SUPABASE_SERVICE_ROLE_KEY['"]?\s*:/i);
}

// --- 8. registry row shape: connected -> active, never carries a key ----------------------
{
  const row = supabaseMcpRegistryRow({ connected: true, detail: 'Reading NI-Brain tables live.' });
  assert.equal(row.name, 'supabase');
  assert.equal(row.scope, 'mcp');
  assert.equal(row.status, 'active');
  assert.equal(row.is_golden, false);
  assert.equal('key' in row, false, 'the registry row must never carry a key field');
  assert.equal(JSON.stringify(row).toLowerCase().includes('sk_live'), false);
}

// --- 9. registry row shape: not connected -> proposed (Off), same row shape ---------------
{
  const row = supabaseMcpRegistryRow({ connected: false, detail: 'Add a Supabase service key…' });
  assert.equal(row.status, 'proposed');
  assert.equal(row.scope, 'mcp');
}

console.log('mcp-supabase.test.mjs OK');
