// Proves telegramSend's optional threadId option includes message_thread_id
// in the outbound payload when passed, and leaves the payload unchanged
// (no message_thread_id key at all) when omitted — existing callers must see
// no behaviour change.
import assert from 'node:assert/strict';
import { telegramSend } from '../lib/telegram.mjs';

function fakeFetch() {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  return { fn, calls };
}

// --- threadId omitted: no message_thread_id key on the payload -------------------------
{
  const { fn, calls } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    await telegramSend('tok', '123', '[X] hello', false);
  } finally {
    global.fetch = realFetch;
  }
  const body = JSON.parse(calls[0].opts.body);
  assert.equal('message_thread_id' in body, false);
}

// --- threadId passed: message_thread_id included ----------------------------------------
{
  const { fn, calls } = fakeFetch();
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    await telegramSend('tok', '123', '[X] hello', false, { threadId: 42 });
  } finally {
    global.fetch = realFetch;
  }
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.message_thread_id, 42);
  assert.equal(body.chat_id, '123');
}

console.log('telegram-send-thread-id.test.mjs passed');
