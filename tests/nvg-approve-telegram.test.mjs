// Proves:
//   1. handleTelegramCallback in lib/telegram-handler.mjs routes "nvga:" callback_data
//      to handleNvgApproveCallback (the router match, not the stale "nvgapprove:" comment).
//   2. approve sets needs_jb_approval=false, status='queued', and stamps
//      [JB approved <iso>] into result_summary (no jb_approved_at column known to exist).
//   3. reject sets status='rejected'.
//   4. Every tap calls editMessageReplyMarkup to remove the inline keyboard, and
//      answerCallbackQuery is always called.
import assert from 'node:assert/strict';
import { handleTelegramCallback } from '../lib/telegram-handler.mjs';

const AGENT_DISPATCH_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeSb({ existingResultSummary = null } = {}) {
  const patches = [];
  const inserts = [];
  const sbSelect = async (table, query) => {
    if (table === 'agent_dispatch') {
      return [{ id: AGENT_DISPATCH_ID, result_summary: existingResultSummary }];
    }
    return [];
  };
  const sbInsert = async (table, row) => {
    inserts.push({ table, row });
    return row;
  };
  const sbPatch = async (table, filter, values) => {
    patches.push({ table, filter, values });
    return {};
  };
  return { sb: { sbSelect, sbInsert, sbPatch }, patches, inserts };
}

function fakeFetch() {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  return { fn, calls };
}

function makeCallbackQuery(data) {
  return {
    id: 'cbq-1',
    data,
    message: { chat: { id: 999 }, message_id: 555 },
  };
}

const cfg = { telegramToken: 'tok', telegramChatId: '999' };

// --- 1. routing: nvga: goes to the nvg-approve handler, not the cm: handler ------------
{
  const { sb } = makeSb();
  const { fn, calls } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const result = await handleTelegramCallback(cfg, sb, makeCallbackQuery(`nvga:d:${AGENT_DISPATCH_ID}:a`));
    assert.equal(result, true);
    // Must have hit answerCallbackQuery, proving it reached the nvg-approve path.
    assert.ok(calls.some((c) => c.url.includes('answerCallbackQuery')));
  } finally {
    global.fetch = realFetch;
  }
}

// --- 2. approve: needs_jb_approval=false, status='queued', result_summary stamped ------
{
  const { sb, patches } = makeSb({ existingResultSummary: 'prior note' });
  const { fn } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    await handleTelegramCallback(cfg, sb, makeCallbackQuery(`nvga:d:${AGENT_DISPATCH_ID}:a`));
  } finally {
    global.fetch = realFetch;
  }
  const dispatchPatch = patches.find((p) => p.table === 'agent_dispatch');
  assert.ok(dispatchPatch, 'expected a patch on agent_dispatch');
  assert.equal(dispatchPatch.values.needs_jb_approval, false);
  assert.equal(dispatchPatch.values.status, 'queued');
  assert.match(dispatchPatch.values.result_summary, /^\[JB approved \d{4}-\d{2}-\d{2}T.*\] prior note$/);
}

// --- 3. reject: status='rejected' -------------------------------------------------------
{
  const { sb, patches } = makeSb();
  const { fn } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    await handleTelegramCallback(cfg, sb, makeCallbackQuery(`nvga:d:${AGENT_DISPATCH_ID}:r`));
  } finally {
    global.fetch = realFetch;
  }
  const dispatchPatch = patches.find((p) => p.table === 'agent_dispatch');
  assert.ok(dispatchPatch, 'expected a patch on agent_dispatch');
  assert.equal(dispatchPatch.values.status, 'rejected');
}

// --- 4. keyboard removal + answerCallbackQuery always called ---------------------------
{
  const { sb, inserts } = makeSb();
  const { fn, calls } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    await handleTelegramCallback(cfg, sb, makeCallbackQuery(`nvga:d:${AGENT_DISPATCH_ID}:a`));
  } finally {
    global.fetch = realFetch;
  }
  assert.ok(calls.some((c) => c.url.includes('editMessageReplyMarkup')), 'expected editMessageReplyMarkup call');
  assert.ok(calls.some((c) => c.url.includes('answerCallbackQuery')), 'expected answerCallbackQuery call');
  const editCall = calls.find((c) => c.url.includes('editMessageReplyMarkup'));
  const body = JSON.parse(editCall.opts.body);
  assert.equal(body.message_id, 555);
  assert.deepEqual(body.reply_markup, { inline_keyboard: [] });

  const tapLog = inserts.find((i) => i.table === 'axon_telegram_messages');
  assert.ok(tapLog, 'expected a tap logged to axon_telegram_messages');
  assert.equal(tapLog.row.message_type, 'approval_tap');
}

console.log('nvg-approve-telegram.test.mjs passed');
