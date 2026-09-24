// TELEGRAM-ROUTING-FIX-0905: JB's private chat stays authorized alongside the
// NVG Agents group, taps are accepted from either, and jb-route resolves to
// the agent's topic (EXEC's topic as fallback, private chat when no group).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedChat } from '../lib/telegram-handler.mjs';
import { resolveJbTarget } from '../lib/jb-route.mjs';
import { loadTelegramConfig } from '../lib/config.mjs';

// Never let an ambient bot token reach loadConfig here — it would trigger a real
// identity check against Telegram from a unit test.
delete process.env.TELEGRAM_BOT_TOKEN;

const cfg = {
  telegramChatId: '-100999',
  telegramDmChatId: '7722',
  telegramGroupChatId: '-100999',
  telegramApprovalsThreadId: '80',
};

test('private chat and group are both authorized; strangers are not', () => {
  assert.equal(isAuthorizedChat(cfg, '7722'), true);
  assert.equal(isAuthorizedChat(cfg, '-100999'), true);
  assert.equal(isAuthorizedChat(cfg, '12345'), false);
});

test('loadTelegramConfig: telegramChatId is the private DM even once the group is provisioned (TELEGRAM-APPROVALS-TO-DM-0924)', async () => {
  const secrets = {
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: '7722',
    TELEGRAM_WEBHOOK_SECRET: 'wh',
    TELEGRAM_GROUP_CHAT_ID: '-100999',
    TELEGRAM_APPROVALS_THREAD_ID: '80',
  };
  const sbSelect = async (_t, q) => {
    const key = decodeURIComponent(q.match(/key=eq\.([^&]+)/)[1]);
    return secrets[key] ? [{ value: secrets[key] }] : [];
  };
  const out = await loadTelegramConfig(undefined, sbSelect);
  assert.equal(out.telegramChatId, '7722', 'JB-facing chat id is the private DM, not the group');
  assert.equal(out.telegramDmChatId, '7722');
  assert.equal(out.telegramGroupChatId, '-100999', 'group id is still resolved for non-JB chatter');
  assert.equal(out.telegramApprovalsThreadId, '80', 'thread id is still resolved (unused for JB-facing routing) until TELEGRAM-RETIRE-APPROVALS-TOPIC-0924 removes it');
});

function fakeSelect({ group = '-100999', threads = {} } = {}) {
  return async (table, q) => {
    if (table === 'ni_platform_secrets') {
      const key = decodeURIComponent(q.match(/key=eq\.([^&]+)/)[1]);
      const map = { TELEGRAM_CHAT_ID: '7722', TELEGRAM_GROUP_CHAT_ID: group, TELEGRAM_APPROVALS_THREAD_ID: '80' };
      return map[key] ? [{ value: map[key] }] : [];
    }
    if (table === 'nvg_agent_routines') {
      const name = decodeURIComponent(q.match(/agent_name=eq\.([^&]+)/)[1]);
      return name in threads ? [{ telegram_thread_id: threads[name] }] : [];
    }
    return [];
  };
}

test('jb-route: DM-first for every JB-facing send (TELEGRAM-APPROVALS-TO-DM-0924) — agentName and approvals no longer route to the group when the DM is provisioned', async () => {
  const threads = { 'AXON Executive': 10, EXEC: 36 };
  // The private chat ('7722') is always provisioned in fakeSelect's default
  // secret map, so every call below resolves to it regardless of agentName
  // or the (now-inert) approvals flag — this is the whole point of the fix.
  assert.deepEqual(await resolveJbTarget(fakeSelect({ threads }), { agentName: 'AXON Executive' }),
    { chatId: '7722', threadId: null, viaGroup: false });
  assert.deepEqual(await resolveJbTarget(fakeSelect({ threads }), { agentName: 'Nobody' }),
    { chatId: '7722', threadId: null, viaGroup: false });
  assert.deepEqual(await resolveJbTarget(fakeSelect({ threads }), { approvals: true }),
    { chatId: '7722', threadId: null, viaGroup: false });
});

test('jb-route: falls back to the group\'s agent topic only when the private DM is not provisioned at all', async () => {
  const threads = { 'AXON Executive': 10, EXEC: 36 };
  function fakeSelectNoDm({ group = '-100999', threads: t = {} } = {}) {
    return async (table, q) => {
      if (table === 'ni_platform_secrets') {
        const key = decodeURIComponent(q.match(/key=eq\.([^&]+)/)[1]);
        const map = { TELEGRAM_GROUP_CHAT_ID: group };
        return map[key] ? [{ value: map[key] }] : [];
      }
      if (table === 'nvg_agent_routines') {
        const name = decodeURIComponent(q.match(/agent_name=eq\.([^&]+)/)[1]);
        return name in t ? [{ telegram_thread_id: t[name] }] : [];
      }
      return [];
    };
  }
  assert.deepEqual(await resolveJbTarget(fakeSelectNoDm({ threads }), { agentName: 'AXON Executive' }),
    { chatId: '-100999', threadId: 10, viaGroup: true });
  assert.deepEqual(await resolveJbTarget(fakeSelectNoDm({ threads }), { agentName: 'Nobody' }),
    { chatId: '-100999', threadId: 36, viaGroup: true });
  assert.deepEqual(await resolveJbTarget(fakeSelectNoDm({ group: null, threads }), { agentName: 'EXEC' }),
    { chatId: null, threadId: null, viaGroup: false },
    'neither DM nor group provisioned: message target is null, never silently wrong');
});

// Council finding (2026-09-05): the live webhook passes loadConfig()'s object,
// not loadTelegramConfig()'s — so the ids must survive that hop too.
test('loadConfig carries the private-chat and group ids so the webhook authorizes both', async () => {
  const { loadConfig } = await import('../lib/config.mjs');
  const { isAuthorizedChat: authz } = await import('../lib/telegram-auth.mjs');
  const secrets = {
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    ANTHROPIC_API_KEY: 'a',
    GEMINI_API_KEY: 'g',
    RESEND_API_KEY: 'r',
    SERPAPI_API_KEY: 's',
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: '7722',
    TELEGRAM_WEBHOOK_SECRET: 'wh',
    TELEGRAM_GROUP_CHAT_ID: '-100999',
    TELEGRAM_APPROVALS_THREAD_ID: '80',
  };
  const sbSelect = async (_t, q) => {
    const m = q.match(/key=eq\.([^&]+)/);
    const key = m ? decodeURIComponent(m[1]) : '';
    return secrets[key] ? [{ value: secrets[key] }] : [];
  };
  const prev = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'k';
  try {
    const cfg = await loadConfig(sbSelect);
    assert.equal(cfg.telegramChatId, '7722', 'JB-facing chat id is the private DM (TELEGRAM-APPROVALS-TO-DM-0924)');
    assert.equal(cfg.telegramDmChatId, '7722');
    assert.equal(cfg.telegramGroupChatId, '-100999');
    assert.equal(authz(cfg, '7722'), true);
    assert.equal(authz(cfg, '-100999'), true, 'group stays authorized for inbound taps even though it is no longer the default send target');
    assert.equal(authz(cfg, '1'), false);
    assert.equal(authz({}, '7722'), true, 'unconfigured bot keeps the legacy open behaviour (webhook 503s before this point)');
  } finally {
    if (prev === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = prev;
  }
});

test('keyboard sends carry the approvals topic when given', async () => {
  const { telegramSendWithKeyboard } = await import('../lib/telegram.mjs');
  const realFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_u, init) => { body = JSON.parse(init.body); return { json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
  try {
    await telegramSendWithKeyboard('t', '-100999', 'hi', { inline_keyboard: [] }, false, { threadId: 80 });
    assert.equal(body.message_thread_id, 80);
    await telegramSendWithKeyboard('t', '7722', 'hi', { inline_keyboard: [] }, false);
    assert.equal('message_thread_id' in body, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('cleanTelegramHumanText strips raw asterisks, headers, and code backticks', async () => {
  const { cleanTelegramHumanText, telegramSend } = await import('../lib/telegram.mjs');
  assert.equal(cleanTelegramHumanText('Here is ****IMPORTANT**** info with **details**.'), 'Here is IMPORTANT info with details.');
  assert.equal(cleanTelegramHumanText('### Status Update\n`code` and ```js\nconst x = 1;\n```'), 'Status Update\ncode and const x = 1;');

  const realFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_u, init) => { body = JSON.parse(init.body); return { json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
  try {
    await telegramSend('t', '7722', '****ALERT**** Everything is **fine**.', false, { untagged: true });
    assert.equal(body.text, 'ALERT Everything is fine.');
  } finally {
    globalThis.fetch = realFetch;
  }
});

