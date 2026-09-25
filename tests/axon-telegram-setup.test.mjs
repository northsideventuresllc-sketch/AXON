#!/usr/bin/env node
/**
 * TELEGRAM-WEBHOOK-SECRET-DEPLOY-0924 — proves scripts/axon-telegram-setup.mjs:
 *   1. Resolves the webhook secret from NI-Brain (via loadConfig/loadTelegramConfig),
 *      not from process.env.TELEGRAM_WEBHOOK_SECRET in isolation, and passes it to
 *      telegramSetWebhook.
 *   2. An env override still wins over the DB value (loadConfig's own precedence).
 *   3. When no secret can be resolved at all, setWebhook is NEVER called and the
 *      call throws (non-zero exit at the CLI boundary) — this is the exact bug that
 *      shipped every deploy with a secret-less webhook and broke every button.
 *   4. Per-agent (--agent) path resolves that agent's own dedicated secret.
 *   5. --polling never needs a secret and calls deleteWebhook, not setWebhook.
 *
 * Run: node tests/axon-telegram-setup.test.mjs
 */
import assert from 'node:assert/strict';
import { runSetup } from '../scripts/axon-telegram-setup.mjs';

function fakeSbSelectFactory(secrets) {
  return async (table, query) => {
    assert.equal(table, 'ni_platform_secrets');
    const match = /key=eq\.([^&]+)/.exec(query);
    const key = decodeURIComponent(match[1]);
    return key in secrets ? [{ value: secrets[key] }] : [];
  };
}

function baseDeps(secrets, overrides = {}) {
  const setWebhookCalls = [];
  const deleteWebhookCalls = [];
  const setCommandsCalls = [];
  const deps = {
    createSupabaseClient: () => ({ sbSelect: fakeSbSelectFactory(secrets) }),
    telegramSetCommands: async (...args) => { setCommandsCalls.push(args); },
    telegramDeleteWebhook: async (...args) => { deleteWebhookCalls.push(args); },
    telegramSetWebhook: async (...args) => { setWebhookCalls.push(args); },
    telegramGetWebhookInfo: async () => ({ url: 'https://example/api/telegram-webhook', pending_update_count: 0 }),
    log: () => {},
    warn: () => {},
    ...overrides,
  };
  return { deps, setWebhookCalls, deleteWebhookCalls, setCommandsCalls };
}

// Isolate from any ambient env the harness might carry.
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TELEGRAM_WEBHOOK_SECRET;
delete process.env.TELEGRAM_WEBHOOK_SECRET_ARCEUS;
delete process.env.AXON_TELEGRAM_AGENT;
process.env.SUPABASE_SERVICE_KEY = 'fake-sb-key';

// --- 1. secret resolved from NI-Brain (no env), passed through to setWebhook ---------
{
  const secrets = {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_WEBHOOK_SECRET: 'db-secret',
  };
  const { deps, setWebhookCalls } = baseDeps(secrets, {
    loadConfig: async (sbSelect, agentKey) => {
      assert.equal(agentKey, undefined);
      return {
        telegramToken: 'bot-token',
        telegramWebhookSecret: 'db-secret',
      };
    },
  });
  await runSetup(['node', 'script', '--webhook', 'https://example/api/telegram-webhook'], deps);
  assert.equal(setWebhookCalls.length, 1);
  assert.deepEqual(setWebhookCalls[0], ['bot-token', 'https://example/api/telegram-webhook', 'db-secret']);
}

// --- 2. env override wins over DB value (loadConfig's own precedence, exercised here
//        through a loadConfig stub honoring that same precedence) ---------------------
{
  process.env.TELEGRAM_WEBHOOK_SECRET = 'env-secret';
  const { deps, setWebhookCalls } = baseDeps({}, {
    loadConfig: async () => ({
      telegramToken: 'bot-token',
      // Mirrors lib/config.mjs's secret() helper: env wins over DB.
      telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    }),
  });
  await runSetup(['node', 'script', '--webhook', 'https://example/api/telegram-webhook'], deps);
  assert.equal(setWebhookCalls.length, 1);
  assert.equal(setWebhookCalls[0][2], 'env-secret');
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
}

// --- 3. no secret resolvable anywhere -> setWebhook NEVER called, throws -------------
{
  const { deps, setWebhookCalls } = baseDeps({}, {
    loadConfig: async () => ({
      telegramToken: 'bot-token',
      telegramWebhookSecret: null,
    }),
  });
  await assert.rejects(
    () => runSetup(['node', 'script', '--webhook', 'https://example/api/telegram-webhook'], deps),
    /refusing to register a webhook with no secret_token/
  );
  assert.equal(setWebhookCalls.length, 0, 'setWebhook must never be called without a resolved secret');
}

// --- 3b. same refusal via --auto (the exact path the on-deploy workflow runs) --------
{
  const { deps, setWebhookCalls } = baseDeps({}, {
    loadConfig: async () => ({
      telegramToken: 'bot-token',
      telegramWebhookSecret: undefined,
    }),
  });
  await assert.rejects(
    () => runSetup(['node', 'script', '--auto'], deps),
    /refusing to register a webhook with no secret_token/
  );
  assert.equal(setWebhookCalls.length, 0);
}

// --- 4. per-agent path resolves that agent's dedicated secret ------------------------
{
  const { deps, setWebhookCalls } = baseDeps({}, {
    loadConfig: async (sbSelect, agentKey) => {
      assert.equal(agentKey, 'arceus');
      return {
        telegramToken: 'arceus-token',
        telegramWebhookSecret: 'arceus-secret',
      };
    },
  });
  await runSetup(['node', 'script', '--agent', 'arceus', '--webhook', 'https://example/api/telegram-webhook?agent=arceus'], deps);
  assert.equal(setWebhookCalls.length, 1);
  assert.deepEqual(setWebhookCalls[0], ['arceus-token', 'https://example/api/telegram-webhook?agent=arceus', 'arceus-secret']);
}

// --- 5. --polling never needs a secret, calls deleteWebhook not setWebhook -----------
{
  const { deps, setWebhookCalls, deleteWebhookCalls } = baseDeps({}, {
    loadConfig: async () => ({
      telegramToken: 'bot-token',
      telegramWebhookSecret: null,
    }),
  });
  await runSetup(['node', 'script', '--polling'], deps);
  assert.equal(setWebhookCalls.length, 0);
  assert.equal(deleteWebhookCalls.length, 1);
}

// --- 6. no --webhook/--auto/--polling at all: commands-only, no secret required ------
{
  const { deps, setWebhookCalls, deleteWebhookCalls } = baseDeps({}, {
    loadConfig: async () => ({
      telegramToken: 'bot-token',
      telegramWebhookSecret: null,
    }),
  });
  await runSetup(['node', 'script'], deps);
  assert.equal(setWebhookCalls.length, 0);
  assert.equal(deleteWebhookCalls.length, 0);
}

// --- 7. missing bot token throws before anything else --------------------------------
{
  const { deps } = baseDeps({}, {
    loadConfig: async () => ({ telegramToken: null }),
  });
  await assert.rejects(
    () => runSetup(['node', 'script', '--auto'], deps),
    /TELEGRAM_BOT_TOKEN not configured/
  );
}

console.log('axon-telegram-setup.test.mjs: all assertions passed');
