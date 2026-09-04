#!/usr/bin/env node
/**
 * TELEGRAM-PER-AGENT-BOT-0827 — proves loadTelegramConfig:
 *   1. With no agentKey, behaves exactly like the old single-bot lookup.
 *   2. With an agentKey that has no dedicated bot provisioned, falls back to
 *      the shared default bot (never goes silently dark for an unprovisioned agent).
 *   3. With an agentKey that DOES have a full dedicated bot (token+chat+secret),
 *      uses that bot's own credentials instead of the default.
 *   4. A PARTIALLY provisioned agent bot (e.g. token+chat but no dedicated
 *      webhook secret yet) falls back to the default bot ENTIRELY — the
 *      fallback is atomic, never a mix of one bot's identity with another
 *      bot's secret.
 *   5. Agent keys normalize to a safe env-var suffix regardless of casing/punctuation.
 *
 * Run: node tests/telegram-per-agent-config.test.mjs
 */
import assert from 'node:assert/strict';
import { loadTelegramConfig } from '../lib/config.mjs';

function fakeSbSelect(secrets) {
  return async (table, query) => {
    assert.equal(table, 'ni_platform_secrets');
    const match = /key=eq\.([^&]+)/.exec(query);
    const key = decodeURIComponent(match[1]);
    return key in secrets ? [{ value: secrets[key] }] : [];
  };
}

// --- 1. no agentKey — identical to pre-existing single-bot lookup ---------------------
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
  });
  const cfg = await loadTelegramConfig(undefined, sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'default-token',
    telegramChatId: 'default-chat',
    telegramWebhookSecret: 'default-secret',
    telegramApprovalsThreadId: null,
  });
}

// --- 2. agentKey with no dedicated bot at all falls back to the default bot -----------
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
  });
  const cfg = await loadTelegramConfig('arceus', sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'default-token',
    telegramChatId: 'default-chat',
    telegramWebhookSecret: 'default-secret',
    telegramApprovalsThreadId: null,
  });
}

// --- 2b. group + approvals thread both provisioned — default path prefers the group ---
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
    TELEGRAM_GROUP_CHAT_ID: '-1004204591575',
    TELEGRAM_APPROVALS_THREAD_ID: '42',
  });
  const cfg = await loadTelegramConfig(undefined, sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'default-token',
    telegramChatId: '-1004204591575',
    telegramWebhookSecret: 'default-secret',
    telegramApprovalsThreadId: '42',
  });
}

// --- 2c. group set WITHOUT the approvals thread — mirrors fn_telegram_approval_ping's
//         own precedence and stays on the legacy chat until both are provisioned -------
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
    TELEGRAM_GROUP_CHAT_ID: '-1004204591575',
  });
  const cfg = await loadTelegramConfig(undefined, sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'default-token',
    telegramChatId: 'default-chat',
    telegramWebhookSecret: 'default-secret',
    telegramApprovalsThreadId: null,
  });
}

// --- 3. agentKey WITH a fully-provisioned dedicated bot uses its own credentials ------
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
    TELEGRAM_BOT_TOKEN_ARCEUS: 'arceus-token',
    TELEGRAM_CHAT_ID_ARCEUS: 'arceus-chat',
    TELEGRAM_WEBHOOK_SECRET_ARCEUS: 'arceus-secret',
  });
  const cfg = await loadTelegramConfig('ARCEUS', sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'arceus-token',
    telegramChatId: 'arceus-chat',
    telegramWebhookSecret: 'arceus-secret',
  });
}

// --- 4. PARTIAL agent provisioning (token+chat, no dedicated secret) falls back -------
//        to the default bot ATOMICALLY — must never pair the agent's own
//        token/chat with the default bot's webhook secret, since that would
//        let anyone holding the default secret forge requests for this agent.
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN: 'default-token',
    TELEGRAM_CHAT_ID: 'default-chat',
    TELEGRAM_WEBHOOK_SECRET: 'default-secret',
    TELEGRAM_BOT_TOKEN_ARCEUS: 'arceus-token',
    TELEGRAM_CHAT_ID_ARCEUS: 'arceus-chat',
    // deliberately no TELEGRAM_WEBHOOK_SECRET_ARCEUS
  });
  const cfg = await loadTelegramConfig('ARCEUS', sbSelect);
  assert.deepEqual(
    cfg,
    {
      telegramToken: 'default-token',
      telegramChatId: 'default-chat',
      telegramWebhookSecret: 'default-secret',
      telegramApprovalsThreadId: null,
    },
    'a partially-provisioned agent bot must fall back to the default bot entirely, not mix credentials'
  );
}

// --- 5. agent key with punctuation normalizes to a safe env-var suffix ----------------
{
  const sbSelect = fakeSbSelect({
    TELEGRAM_BOT_TOKEN_MATCH_FIT_BOT: 'mf-token',
    TELEGRAM_CHAT_ID_MATCH_FIT_BOT: 'mf-chat',
    TELEGRAM_WEBHOOK_SECRET_MATCH_FIT_BOT: 'mf-secret',
  });
  const cfg = await loadTelegramConfig('match-fit bot', sbSelect);
  assert.deepEqual(cfg, {
    telegramToken: 'mf-token',
    telegramChatId: 'mf-chat',
    telegramWebhookSecret: 'mf-secret',
  });
}

console.log('telegram-per-agent-config.test.mjs: all assertions passed');
