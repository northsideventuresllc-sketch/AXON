#!/usr/bin/env node
/**
 * End-to-end check for BPA-FOLLOWUP-OUTREACH-EVENT-LOOP-CAP-0906: a double Approve tap on the
 * same lead (Telegram replays a callback update until the webhook answers 2xx, same root cause
 * as the stale-callback fix in lib/telegram.mjs) must queue the lead in Match Fit exactly once.
 * Run: node tests/match-fit-outreach-approve-dedup.test.mjs
 */
import assert from 'node:assert/strict';
import { handleOutreachCallback } from '../lib/telegram-handler.mjs';

process.env.MATCH_FIT_APP_URL = 'https://matchfit.test';
process.env.MATCH_FIT_SERVICE_TOKEN = 'test-service-token';

const originalFetch = global.fetch;
let queueCalls = 0;

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/api/admin/outreach/dispatch/queue')) {
    queueCalls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (u.includes('api.telegram.org')) {
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  throw new Error(`unexpected fetch in approve-dedup test: ${u}`);
};

try {
  const cfg = { telegramToken: 'test-token', telegramChatId: '999', dryRun: true };
  const baseCallbackQuery = {
    data: 'mf:ap:ig:double_tap_lead',
    message: { chat: { id: 999 } },
  };

  await handleOutreachCallback(cfg, { ...baseCallbackQuery, id: 'cbq-1' });
  await handleOutreachCallback(cfg, { ...baseCallbackQuery, id: 'cbq-2' }); // replayed retry

  assert.equal(queueCalls, 1, 'a duplicate Approve tap must not queue the lead twice');

  // A different lead is unaffected by the dedup window.
  await handleOutreachCallback(cfg, {
    data: 'mf:ap:ig:other_lead',
    message: { chat: { id: 999 } },
    id: 'cbq-3',
  });
  assert.equal(queueCalls, 2);
} finally {
  global.fetch = originalFetch;
  delete process.env.MATCH_FIT_APP_URL;
  delete process.env.MATCH_FIT_SERVICE_TOKEN;
}

console.log('match-fit-outreach-approve-dedup.test.mjs: all assertions passed');
