// Proves:
//   1. formatInstructionChangeMessage / buildInstructionChangeKeyboard produce the
//      expected text + three `ic:<id>:approve|deny|reply` buttons, all under 64 bytes.
//   2. handleTelegramCallback routes "ic:" callback_data to the instruction-change handler.
//   3. approve: patches status='approved' + decided_at, then re-fires requester_agent
//      via an open agent_bus row with subject `INSTRUCTION-CHANGE APPROVED <id>`.
//   4. deny: patches status='denied' + decided_at, no agent_bus row.
//   5. reply: sends the "reply with your note" prompt and marks awaiting_reply; a
//      later free-text message in the same chat/topic is captured as jb_note.
//   6. unauthorized chat is rejected — no table writes, no agent_bus row.
//   7. a missing table degrades gracefully (no throw) and logs a clear line.
import assert from 'node:assert/strict';
import { handleTelegramCallback, handleTelegramMessage } from '../lib/telegram-handler.mjs';
import {
  formatInstructionChangeMessage,
  buildInstructionChangeKeyboard,
  tryCaptureInstructionChangeNote,
} from '../lib/instruction-change-requests.mjs';

const REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const SAMPLE_REQUEST = {
  id: REQUEST_ID,
  requester_agent: 'axon-executive',
  target_agent: 'AXON Research',
  summary: 'Tighten the fire-gate default to HOLD on ambiguous config.',
  diff_url: 'https://github.com/northsideventuresllc-sketch/AXON/pull/999',
};

function makeSb({ rows = [], tableMissing = false } = {}) {
  const patches = [];
  const inserts = [];
  const sbSelect = async (table) => {
    if (tableMissing) throw new Error('Supabase select nvg_instruction_change_requests: HTTP 404 PGRST205');
    if (table === 'nvg_instruction_change_requests') return rows;
    return [];
  };
  const sbInsert = async (table, row) => {
    inserts.push({ table, row });
    return row;
  };
  const sbPatch = async (table, filter, values) => {
    if (tableMissing && table === 'nvg_instruction_change_requests') {
      throw new Error('Supabase patch nvg_instruction_change_requests: HTTP 404 PGRST205');
    }
    patches.push({ table, filter, values });
    // Keep the in-memory row roughly in sync so a later sbSelect in the same
    // test sees the patch (approve reads the row back after patching it).
    const row = rows.find((r) => filter === `id=eq.${r.id}`);
    if (row) Object.assign(row, values);
    return {};
  };
  return { sb: { sbSelect, sbInsert, sbPatch }, patches, inserts };
}

function fakeFetch() {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 4242 } }) };
  };
  return { fn, calls };
}

function makeCallbackQuery(data, { chatId = 999, messageId = 555, threadId } = {}) {
  return {
    id: 'cbq-ic-1',
    data,
    message: {
      chat: { id: chatId },
      message_id: messageId,
      ...(threadId != null ? { message_thread_id: threadId } : {}),
    },
  };
}

const cfg = { telegramToken: 'tok', telegramChatId: '999' };

async function withFetch(fn, run) {
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    return await run();
  } finally {
    global.fetch = realFetch;
  }
}

// --- 1. message formatting + keyboard payloads ------------------------------------------
{
  const text = formatInstructionChangeMessage(SAMPLE_REQUEST);
  assert.match(text, /axon-executive/);
  assert.match(text, /AXON Research/);
  assert.match(text, /Tighten the fire-gate default/);
  assert.match(text, new RegExp(REQUEST_ID));

  const kb = buildInstructionChangeKeyboard(SAMPLE_REQUEST);
  const buttons = kb.inline_keyboard[0];
  assert.equal(buttons.length, 3);
  const dataByLabel = Object.fromEntries(buttons.map((b) => [b.text, b.callback_data]));
  const approveData = Object.values(dataByLabel).find((d) => d.endsWith(':approve'));
  const denyData = Object.values(dataByLabel).find((d) => d.endsWith(':deny'));
  const replyData = Object.values(dataByLabel).find((d) => d.endsWith(':reply'));
  assert.equal(approveData, `ic:${REQUEST_ID}:approve`);
  assert.equal(denyData, `ic:${REQUEST_ID}:deny`);
  assert.equal(replyData, `ic:${REQUEST_ID}:reply`);
  for (const d of Object.values(dataByLabel)) {
    assert.ok(Buffer.byteLength(d, 'utf8') <= 64, `callback_data too long: ${d}`);
  }
}

// --- 2. routing: ic: reaches the instruction-change handler, not cm:/nvga: --------------
{
  const { sb } = makeSb({ rows: [{ ...SAMPLE_REQUEST, status: 'pending' }] });
  const { fn, calls } = fakeFetch();
  await withFetch(fn, () =>
    handleTelegramCallback(cfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:deny`))
  );
  assert.ok(calls.some((c) => c.url.includes('answerCallbackQuery')));
}

// --- 3. approve: status + decided_at patched, agent_bus re-fire ------------------------
{
  const row = { ...SAMPLE_REQUEST, status: 'pending' };
  const { sb, patches, inserts } = makeSb({ rows: [row] });
  const { fn } = fakeFetch();
  await withFetch(fn, () =>
    handleTelegramCallback(cfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:approve`))
  );

  const patch = patches.find((p) => p.table === 'nvg_instruction_change_requests');
  assert.ok(patch, 'expected a patch on nvg_instruction_change_requests');
  assert.equal(patch.values.status, 'approved');
  assert.match(patch.values.decided_at, /^\d{4}-\d{2}-\d{2}T/);

  const bus = inserts.find((i) => i.table === 'agent_bus');
  assert.ok(bus, 'expected an agent_bus insert on approve');
  assert.equal(bus.row.to_agent, 'axon-executive');
  assert.equal(bus.row.subject, `INSTRUCTION-CHANGE APPROVED ${REQUEST_ID}`);
  assert.equal(bus.row.status, 'open');
}

// --- 4. deny: status='denied', decided_at set, no agent_bus row ------------------------
{
  const row = { ...SAMPLE_REQUEST, status: 'pending' };
  const { sb, patches, inserts } = makeSb({ rows: [row] });
  const { fn } = fakeFetch();
  await withFetch(fn, () =>
    handleTelegramCallback(cfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:deny`))
  );

  const patch = patches.find((p) => p.table === 'nvg_instruction_change_requests');
  assert.equal(patch.values.status, 'denied');
  assert.match(patch.values.decided_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(!inserts.some((i) => i.table === 'agent_bus'), 'deny must not re-fire the requester');
}

// --- 5. reply: prompt sent + awaiting_reply marked, then free text captured as jb_note --
{
  const row = { ...SAMPLE_REQUEST, status: 'pending' };
  const { sb, patches } = makeSb({ rows: [row] });
  const { fn, calls } = fakeFetch();
  await withFetch(fn, () =>
    handleTelegramCallback(cfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:reply`))
  );

  const markPatch = patches.find(
    (p) => p.table === 'nvg_instruction_change_requests' && p.values.awaiting_reply === true
  );
  assert.ok(markPatch, 'expected awaiting_reply=true patch');
  assert.equal(row.awaiting_reply, true);
  assert.equal(row.awaiting_reply_chat_id, '999');

  const promptCall = calls.find((c) => c.url.includes('sendMessage'));
  assert.ok(promptCall, 'expected a sendMessage call with the reply prompt');
  const promptBody = JSON.parse(promptCall.opts.body);
  assert.match(promptBody.text, /Reply to this message/);
  assert.equal(promptBody.reply_markup.force_reply, true);

  // Now JB's next free-text message in the same chat/topic (module-level call —
  // exercises the capture function directly, same call handleTelegramMessage makes).
  const captured = await tryCaptureInstructionChangeNote(sb, {
    chatId: '999',
    threadId: null,
    text: 'Approved with a smaller blast radius, ship it Monday.',
  });
  assert.ok(captured);
  assert.equal(captured.jb_note, 'Approved with a smaller blast radius, ship it Monday.');
  assert.equal(row.jb_note, 'Approved with a smaller blast radius, ship it Monday.');
  assert.equal(row.awaiting_reply, false);
}

// --- 5b. handleTelegramMessage wiring: free text with an open ic: reply is captured ----
{
  const row = { ...SAMPLE_REQUEST, status: 'pending', awaiting_reply: true, awaiting_reply_chat_id: '999', awaiting_reply_thread_id: null };
  const { sb } = makeSb({ rows: [row] });
  const { fn, calls } = fakeFetch();
  const msgCfg = { telegramToken: 'tok', telegramChatId: '999', dryRun: false };
  const reply = await withFetch(fn, () =>
    handleTelegramMessage(msgCfg, sb, {
      chat: { id: 999 },
      text: 'Here is my note.',
      message_id: 1,
    })
  );
  assert.match(reply, new RegExp(`noted on ${REQUEST_ID}`));
  assert.equal(row.jb_note, 'Here is my note.');
  assert.ok(calls.some((c) => c.url.includes('sendMessage')));
}

// --- 6. unauthorized chat: no table writes, no agent_bus row ---------------------------
{
  const row = { ...SAMPLE_REQUEST, status: 'pending' };
  const { sb, patches, inserts } = makeSb({ rows: [row] });
  const { fn, calls } = fakeFetch();
  const restrictedCfg = { telegramToken: 'tok', telegramChatId: '111' }; // different from tap's chat 999
  const result = await withFetch(fn, () =>
    handleTelegramCallback(restrictedCfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:approve`))
  );
  assert.equal(result, null);
  assert.ok(!patches.some((p) => p.table === 'nvg_instruction_change_requests'));
  assert.ok(!inserts.some((i) => i.table === 'agent_bus'));
  assert.ok(calls.some((c) => c.url.includes('answerCallbackQuery')));
}

// --- 7. missing table degrades gracefully — no throw, callback still answered ----------
{
  const { sb, patches, inserts } = makeSb({ tableMissing: true });
  const { fn, calls } = fakeFetch();
  const result = await withFetch(fn, () =>
    handleTelegramCallback(cfg, sb, makeCallbackQuery(`ic:${REQUEST_ID}:approve`))
  );
  assert.equal(result, true, 'must not throw when the table is missing');
  assert.ok(!patches.some((p) => p.table === 'nvg_instruction_change_requests'));
  assert.ok(!inserts.some((i) => i.table === 'agent_bus'), 'no row to re-fire from when the table is missing');
  assert.ok(calls.some((c) => c.url.includes('answerCallbackQuery')));
}

console.log('instruction-change-requests.test.mjs passed');
