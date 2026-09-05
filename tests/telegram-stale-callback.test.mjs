// A stale callback query (Telegram replaying an old tap) must not throw —
// throwing made the webhook 500 and Telegram retried the same update forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramAnswerCallbackQuery } from '../lib/telegram.mjs';

test('stale callback answer returns a soft result instead of throwing', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ ok: false, description: 'Bad Request: query is too old and response timeout expired or query ID is invalid' }) });
  try {
    const out = await telegramAnswerCallbackQuery('t', 'cb-1', 'ok');
    assert.equal(out.ok, false);
    assert.equal(out.stale, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('other answer failures still throw', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ ok: false, description: 'Unauthorized' }) });
  try {
    await assert.rejects(() => telegramAnswerCallbackQuery('t', 'cb-2'), /Unauthorized/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
