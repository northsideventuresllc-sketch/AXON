#!/usr/bin/env node
/**
 * BPA-FOLLOWUP-GEMINI-JSON-MODE-0906 — proves two things #179's router rewire dropped:
 *   1. The Gemini lane sets generationConfig.responseMimeType='application/json' when
 *      the caller asks for JSON (jsonMode:true), and never sets it for plain-text callers.
 *   2. A caller's own maxTokens reaches every paid-lane provider call (Gemini, Anthropic),
 *      instead of the flat max_tokens:1024 every caller got regardless of what it asked for.
 *
 * Exercises executeLane() directly with synthetic lanes — loadSecret() checks
 * process.env[secret_key] before ever touching ni_platform_secrets, so this needs no
 * Supabase network mocking at all, only the provider fetch calls.
 *
 * Run: node tests/router-json-mode-max-tokens.test.mjs
 */
import assert from 'node:assert/strict';
import { executeLane } from '../lib/axon-router-core.mjs';

const GEMINI_LANE = {
  laneId: 'test-gemini',
  model: 'gemini-2.5-flash-lite',
  connectorKind: 'api',
  route: {
    id: 'gemini-route',
    name: 'gemini-api',
    kind: 'api',
    connector_kind: 'api',
    cli_command: null,
    base_url: 'https://generativelanguage.googleapis.com',
    secret_key: 'TEST_GEMINI_KEY_ROUTER_JSON_MODE',
    requires_mini: false,
  },
};

const ANTHROPIC_LANE = {
  laneId: 'test-anthropic',
  model: 'claude-haiku-4-5-20251001',
  connectorKind: 'api',
  route: {
    id: 'anthropic-route',
    name: 'anthropic-api',
    kind: 'api',
    connector_kind: 'api',
    cli_command: null,
    base_url: 'https://api.anthropic.com',
    secret_key: 'TEST_ANTHROPIC_KEY_ROUTER_JSON_MODE',
    requires_mini: false,
  },
};

process.env.TEST_GEMINI_KEY_ROUTER_JSON_MODE = 'fake-gemini-key';
process.env.TEST_ANTHROPIC_KEY_ROUTER_JSON_MODE = 'fake-anthropic-key';

// --- 1. jsonMode:true sets Gemini's responseMimeType, and maxTokens sets maxOutputTokens ---
{
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
    };
  };

  const out = await executeLane(
    'fake-supabase-key',
    GEMINI_LANE,
    [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    { maxTokens: 2500, jsonMode: true },
  );
  global.fetch = originalFetch;

  assert.equal(out.reply, '{"ok":true}');
  assert.equal(
    capturedBody.generationConfig.responseMimeType,
    'application/json',
    'jsonMode:true must set Gemini responseMimeType=application/json',
  );
  assert.equal(
    capturedBody.generationConfig.maxOutputTokens,
    2500,
    'caller maxTokens must reach Gemini maxOutputTokens, not the old flat 1024',
  );
}

// --- 2. jsonMode left unset (plain-text callers) never forces JSON mode on Gemini ---------
{
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'plain text' }] } }] }) };
  };

  await executeLane('fake-supabase-key', GEMINI_LANE, [{ role: 'user', content: 'hi' }], { maxTokens: 700 });
  global.fetch = originalFetch;

  assert.equal(capturedBody.generationConfig.maxOutputTokens, 700);
  assert.equal(
    capturedBody.generationConfig.responseMimeType,
    undefined,
    'plain-text callers must not get JSON mode forced on them',
  );
}

// --- 3. caller maxTokens reaches the paid Anthropic lane, not the old flat 1024 -----------
{
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ content: [{ text: 'anthropic reply' }] }) };
  };

  const out = await executeLane(
    'fake-supabase-key',
    ANTHROPIC_LANE,
    [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    { maxTokens: 1200 },
  );
  global.fetch = originalFetch;

  assert.equal(out.reply, 'anthropic reply');
  assert.equal(capturedBody.max_tokens, 1200, 'caller maxTokens must reach the paid Anthropic lane');
}

// --- 4. omitting maxTokens still defaults to 1024, not a silent 0/undefined --------------
{
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ content: [{ text: 'default reply' }] }) };
  };

  await executeLane('fake-supabase-key', ANTHROPIC_LANE, [{ role: 'user', content: 'hi' }]);
  global.fetch = originalFetch;

  assert.equal(capturedBody.max_tokens, 1024);
}

console.log('router-json-mode-max-tokens.test.mjs OK');
