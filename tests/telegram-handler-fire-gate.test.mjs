// Stress test for the 2026-07-23 fixes:
//   1. lib/telegram-handler.mjs missing SOURCE/shortId/parseNotes imports
//      (broke every /approve /reject /sent_li /status command)
//   2. FIRE/HOLD gate not enforced on the actual resendSend call in
//      handleApprove (HOLD must block sends, FIRE must allow them)
// Uses an in-memory fake Supabase client — no network calls.
import assert from 'node:assert/strict';
import { handleTelegramMessage } from '../lib/telegram-handler.mjs';

const LEAD_ID = '11111111-2222-3333-4444-555555555555';
const SHORT_ID = LEAD_ID.slice(0, 8);

function makeDb() {
  const leads = [
    {
      id: LEAD_ID,
      handle: 'Acme Corp',
      status: 'pending_approval',
      comment_draft: 'Hello Acme',
      notes: JSON.stringify({ channel: 'email', contact_email: 'ops@acme.test' }),
    },
  ];
  const inserts = [];
  const patches = [];

  const sbSelect = async (table, query) => {
    if (table === 'ni_brain_outreach') {
      return leads.map((l) => ({ ...l }));
    }
    if (table === 'axon_tool_edit_signals') return [];
    if (table === 'axon_chat_sessions' || query?.includes('chat_id')) {
      return [{ id: 'conv-1', chat_id: '1', history: [] }];
    }
    return [];
  };
  const sbInsert = async (table, row) => {
    inserts.push({ table, row });
    return { id: 'conv-1', ...row };
  };
  const sbPatch = async (table, filter, values) => {
    patches.push({ table, filter, values });
    if (table === 'ni_brain_outreach') {
      Object.assign(leads[0], values);
    }
    return {};
  };

  return { sb: { sbSelect, sbInsert, sbPatch }, leads, inserts, patches };
}

const baseCfg = { resendKey: 'test-key', dryRun: true, telegramToken: 'test-token' };

async function run() {
  // 1. /status must not throw the ReferenceError the missing imports caused.
  {
    const { sb } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: '/status',
      chat: { id: '1' },
      message_id: 1,
    });
    assert.ok(reply && !/something went wrong/i.test(reply), `/status should not fail: ${reply}`);
  }

  // 2. /approve with an unknown ID degrades gracefully, no crash.
  {
    const { sb } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: '/approve zzzzzzzz',
      chat: { id: '1' },
      message_id: 2,
    });
    assert.match(reply, /couldn't find/i);
  }

  // 3. /approve with no ID asks for one instead of crashing.
  {
    const { sb } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: '/approve',
      chat: { id: '1' },
      message_id: 3,
    });
    assert.match(reply, /need the lead id/i);
  }

  // 4. FIRE gate HOLD: /approve <valid id> must NOT send, must say HOLD, and
  //    must leave the lead 'approved' (not 'sent') so nothing is lost.
  {
    delete process.env.AXON_FIRE_MODE;
    process.env.AXON_FIRE_MODE = 'HOLD';
    const { sb, leads } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: `/approve ${SHORT_ID}`,
      chat: { id: '1' },
      message_id: 4,
    });
    assert.match(reply, /on hold/i, `expected HOLD message, got: ${reply}`);
    assert.equal(leads[0].status, 'approved', 'lead must stay approved, not sent, while on HOLD');
  }

  // 5. FIRE gate FIRE: /approve <valid id> proceeds to "send" (dryRun stubs
  //    the actual Resend call) and marks the lead sent.
  {
    process.env.AXON_FIRE_MODE = 'FIRE';
    const { sb, leads } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: `/approve ${SHORT_ID}`,
      chat: { id: '1' },
      message_id: 5,
    });
    assert.match(reply, /email sent/i, `expected send confirmation, got: ${reply}`);
    assert.equal(leads[0].status, 'sent', 'lead must be marked sent once FIRE is active');
    delete process.env.AXON_FIRE_MODE;
  }

  // 6. Garbage/unrecognized command doesn't crash the handler.
  {
    const { sb } = makeDb();
    const reply = await handleTelegramMessage(baseCfg, sb, {
      text: '/definitely_not_a_real_command',
      chat: { id: '1' },
      message_id: 6,
    });
    assert.match(reply, /didn't recognize/i);
  }

  console.log('telegram-handler-fire-gate.test.mjs OK');
}

run().catch((err) => {
  console.error('telegram-handler-fire-gate.test.mjs FAILED:', err);
  process.exit(1);
});
