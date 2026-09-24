// P2-ACK: JB must always know his Telegram answer got through.
// Telegram (global fetch) and NI-Brain (sb) are mocked; nothing leaves the process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTelegramCallback, handleTelegramMessage } from '../lib/telegram-handler.mjs';
import { handleTelegramApprovalReply } from '../lib/telegram-approval-reply.mjs';
import {
  JB_TEXT,
  boxLines,
  explainFromRow,
  isQuestionReply,
  nextStepLine,
  priorChoice,
} from '../lib/telegram-jb-receipts.mjs';

const DISPATCH_ID = '11111111-2222-3333-4444-555555555555';
const CARD_TEXT = '🟡 Needs Your Approval\n\nOK to merge the pricing fix?\n\n👉 Tap an option below or reply to this message.';
const cfg = { telegramToken: 'tok', telegramChatId: '999' };

function makeRow(over = {}) {
  return {
    id: DISPATCH_ID,
    code: 'W2-PRICING-FIX',
    title: 'Merge pricing fix',
    owner: 'BUILD',
    jb_ask: 'OK to merge the pricing fix?',
    jb_options: ['✅ Approve', '❌ Reject'],
    result_summary: 'Pending',
    status: 'needs_jb',
    needs_jb_approval: true,
    ...over,
  };
}

function makeSb({ row = makeRow(), patchFails = false, cardLog = true } = {}) {
  const state = { row: row ? { ...row } : null, patches: [], inserts: [] };
  const sb = {
    sbSelect: async (table) => {
      if (table === 'agent_dispatch') return state.row ? [{ ...state.row }] : [];
      if (table === 'axon_telegram_messages' && cardLog) {
        return [{
          id: 'log-1',
          conversation_id: 'conv-1',
          message_type: 'approval_ping',
          telegram_message_id: 555,
          content: CARD_TEXT,
          metadata: { dispatch_id: DISPATCH_ID, agent_name: 'BUILD' },
        }];
      }
      return [];
    },
    sbInsert: async (table, r) => {
      state.inserts.push({ table, row: r });
      return r;
    },
    sbPatch: async (table, filter, values) => {
      if (patchFails) throw new Error('write refused');
      state.patches.push({ table, filter, values });
      if (table === 'agent_dispatch') Object.assign(state.row, values);
      return {};
    },
  };
  return { sb, state };
}

async function withFetch(fn, respond = () => ({ ok: true, result: { message_id: 777 } })) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const method = String(url).split('/').pop();
    const body = opts?.body ? JSON.parse(opts.body) : {};
    calls.push({ method, body });
    return { ok: true, json: async () => respond(method, body) };
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
  return calls;
}

function tap(optionIdx, id = 'cbq-1') {
  return {
    id,
    data: `nvga:d:${DISPATCH_ID}:${optionIdx}`,
    message: {
      chat: { id: 999 },
      message_id: 555,
      text: CARD_TEXT,
      reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `nvga:d:${DISPATCH_ID}:0` }]] },
    },
  };
}

test('tap success: card keeps its question and its buttons become a boxed receipt', async () => {
  const { sb, state } = makeSb();
  const calls = await withFetch(async () => {
    const out = await handleTelegramCallback(cfg, sb, tap(0));
    assert.equal(out, true);
  });
  const patch = state.patches.find((p) => p.table === 'agent_dispatch');
  assert.equal(patch.values.status, 'queued');
  assert.match(patch.values.result_summary, /^\[JB selected: "✅ Approve" /);

  const answer = calls.find((c) => c.method === 'answerCallbackQuery');
  assert.ok(answer, 'answerCallbackQuery is still called');
  const edit = calls.find((c) => c.method === 'editMessageText');
  assert.ok(edit, 'card is edited');
  assert.equal(edit.body.parse_mode, 'HTML');
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });
  assert.match(edit.body.text, /OK to merge the pricing fix\?/, 'question kept');
  assert.doesNotMatch(edit.body.text, /Tap an option below/, 'tap hint removed');
  assert.match(edit.body.text, /<pre>┌─+┐\n│ ✅ GOT IT +│\n│ You chose: ✅ Approve +│\n└─+┘<\/pre>/);
  assert.match(edit.body.text, /The build agent will pick this up now\.$/);
});

test('tap on a "no" option says the agent will hold off', async () => {
  const { sb } = makeSb();
  const calls = await withFetch(() => handleTelegramCallback(cfg, sb, tap(1)));
  const edit = calls.find((c) => c.method === 'editMessageText');
  assert.match(edit.body.text, /You chose: ❌ Reject/);
  assert.match(edit.body.text, /The build agent will see your answer and hold off\.$/);
});

test('tap failure: card says it did not go through and keeps the buttons', async () => {
  const { sb, state } = makeSb({ patchFails: true });
  const calls = await withFetch(async () => {
    const out = await handleTelegramCallback(cfg, sb, tap(0));
    assert.equal(out, false);
  });
  const answer = calls.find((c) => c.method === 'answerCallbackQuery');
  assert.equal(answer.body.text, JB_TEXT.failed);
  assert.equal(answer.body.show_alert, true);
  const edit = calls.find((c) => c.method === 'editMessageText');
  assert.ok(edit, 'card is edited to show the failure');
  assert.match(edit.body.text, /That didn't go through\./);
  assert.match(edit.body.text, /Tap again\./);
  assert.ok(edit.body.reply_markup.inline_keyboard.length > 0, 'buttons kept');
  assert.ok(state.inserts.some((i) => i.row?.metadata?.note === 'record_failed'), 'failure is logged');
});

test('tap failure: a missing task row also shows the retry text, never silence', async () => {
  const { sb } = makeSb({ row: null });
  const calls = await withFetch(() => handleTelegramCallback(cfg, sb, tap(0)));
  assert.equal(calls.find((c) => c.method === 'answerCallbackQuery').body.text, JB_TEXT.failed);
  assert.match(calls.find((c) => c.method === 'editMessageText').body.text, /Tap again\./);
});

test('receipt still reaches JB when the card edit itself fails', async () => {
  const { sb } = makeSb();
  const calls = await withFetch(
    () => handleTelegramCallback(cfg, sb, tap(0)),
    (method) => (method === 'editMessageText' ? { ok: false, description: 'message to edit not found' } : { ok: true, result: { message_id: 1 } }),
  );
  assert.ok(calls.some((c) => c.method === 'editMessageReplyMarkup'), 'buttons removed');
  const sent = calls.find((c) => c.method === 'sendMessage');
  assert.ok(sent, 'receipt sent as a reply');
  assert.match(sent.body.text, /GOT IT/);
  assert.equal(sent.body.reply_parameters.message_id, 555);
});

test('double tap is idempotent: one write, second tap says what was chosen', async () => {
  const { sb, state } = makeSb();
  let calls = await withFetch(() => handleTelegramCallback(cfg, sb, tap(0, 'cbq-a')));
  assert.equal(state.patches.filter((p) => p.table === 'agent_dispatch').length, 1);
  calls = await withFetch(() => handleTelegramCallback(cfg, sb, tap(1, 'cbq-b')));
  assert.equal(state.patches.filter((p) => p.table === 'agent_dispatch').length, 1, 'no second write');
  const answer = calls.find((c) => c.method === 'answerCallbackQuery');
  assert.equal(answer.body.text, 'Already answered: you chose ✅ Approve.');
  const edit = calls.find((c) => c.method === 'editMessageText');
  assert.match(edit.body.text, /You chose: ✅ Approve/, 'card shows the original choice');
  assert.ok(state.inserts.some((i) => i.row?.metadata?.note === 'already_answered'));
});

test('priorChoice reads the recorded answer and ignores re-asked rows', () => {
  assert.equal(priorChoice(makeRow()), null);
  assert.equal(priorChoice(makeRow({ status: 'queued', needs_jb_approval: false, result_summary: '[JB selected: "Yes" 2026-09-24T00:00:00Z] x' })), 'Yes');
  assert.equal(priorChoice(makeRow({ status: 'queued', needs_jb_approval: false, result_summary: '[JB approved 2026-09-24T00:00:00Z]' })), 'Approve');
  assert.equal(priorChoice(makeRow({ status: 'rejected' })), 'Reject');
  assert.equal(priorChoice(makeRow({ needs_jb_approval: true, result_summary: '[JB selected: "Yes" old]' })), null);
});

function reply(text, replyTo = 555) {
  return {
    message_id: 900,
    chat: { id: 999 },
    text,
    reply_to_message: { message_id: replyTo, text: CARD_TEXT },
  };
}

test('typed reply to a card is saved against its task and acknowledged in a box', async () => {
  const { sb, state } = makeSb();
  let out;
  const calls = await withFetch(async () => {
    out = await handleTelegramApprovalReply(cfg, sb, reply('Only after the staging run passes'));
  });
  const patch = state.patches.find((p) => p.table === 'agent_dispatch');
  assert.ok(patch, 'saved on the task');
  assert.match(patch.values.result_summary, /^\[JB feedback .*\]: "Only after the staging run passes" \| Pending$/);
  assert.ok(state.inserts.some((i) => i.table === 'agent_bus' && i.row.to_agent === 'BUILD'), 'owner told');

  const sent = calls.find((c) => c.method === 'sendMessage');
  assert.equal(sent.body.parse_mode, 'HTML');
  assert.equal(sent.body.reply_parameters.message_id, 900, 'replies to JB\'s message');
  assert.match(sent.body.text, /^<pre>┌─+┐\n│ ✅ GOT YOUR REPLY │\n└─+┘<\/pre>/, 'box at the top');
  assert.match(sent.body.text, /Saved your note on &quot;OK to merge the pricing fix\?&quot;/);
  assert.match(sent.body.text, /The build agent will act on it next\./);
  assert.match(out, /GOT YOUR REPLY/);
});

test('typed reply that fails to save says so instead of a false receipt', async () => {
  const { sb } = makeSb({ patchFails: true });
  const calls = await withFetch(() => handleTelegramApprovalReply(cfg, sb, reply('Wait until Monday')));
  const sent = calls.find((c) => c.method === 'sendMessage');
  assert.match(sent.body.text, /That didn't go through\./);
  assert.match(sent.body.text, /Send your reply again\./);
  assert.doesNotMatch(sent.body.text, /GOT YOUR REPLY/);
});

test('question reply gets a plain-English explanation and the buttons again', async () => {
  const { sb, state } = makeSb();
  const calls = await withFetch(() =>
    handleTelegramApprovalReply(cfg, sb, reply('more context?'), {
      explain: async (_cfg, { row }) => explainFromRow(row),
    }),
  );
  assert.equal(state.patches.length, 0, 'a question is not saved as an instruction');
  const sent = calls.find((c) => c.method === 'sendMessage');
  assert.match(sent.body.text, /Here's what this card is about:/);
  assert.match(sent.body.text, /The question: OK to merge the pricing fix\?/);
  assert.match(sent.body.text, /The build agent is waiting on your answer/);
  assert.deepEqual(
    sent.body.reply_markup.inline_keyboard.map((r) => r[0].callback_data),
    [`nvga:d:${DISPATCH_ID}:0`, `nvga:d:${DISPATCH_ID}:1`],
  );
  const reshow = state.inserts.find((i) => i.row?.message_type === 'approval_card_reshow');
  assert.ok(reshow, 're-shown card is logged so a reply to it works');
  assert.equal(reshow.row.telegram_message_id, 777);
  assert.equal(reshow.row.metadata.dispatch_id, DISPATCH_ID);
});

test('question on an answered card explains without re-showing buttons', async () => {
  const { sb } = makeSb({
    row: makeRow({ status: 'queued', needs_jb_approval: false, result_summary: '[JB selected: "✅ Approve" 2026-09-24T00:00:00Z]' }),
  });
  const calls = await withFetch(() =>
    handleTelegramApprovalReply(cfg, sb, reply('explain'), { explain: async (_c, { row }) => explainFromRow(row) }),
  );
  const sent = calls.find((c) => c.method === 'sendMessage');
  assert.match(sent.body.text, /You already answered this one\. Already answered: you chose ✅ Approve\./);
  assert.equal(sent.body.reply_markup, undefined);
});

test('reply to a message that is not a card is left to the normal chat flow', async () => {
  const { sb } = makeSb({ cardLog: false });
  const msg = { message_id: 901, chat: { id: 999 }, text: 'thanks', reply_to_message: { message_id: 42, text: 'Morning update' } };
  const out = await handleTelegramApprovalReply(cfg, sb, msg);
  assert.equal(out, null);
});

test('group message outside an agent topic still gets an acknowledgement', async () => {
  const { sb } = makeSb({ cardLog: false });
  const gcfg = { ...cfg, telegramGroupChatId: '999' };
  let out;
  const calls = await withFetch(async () => {
    out = await handleTelegramMessage(gcfg, sb, { message_id: 5, chat: { id: 999 }, text: 'hello?' });
  });
  assert.equal(out, JB_TEXT.nonCardAck);
  assert.equal(calls.find((c) => c.method === 'sendMessage').body.text, JB_TEXT.nonCardAck);
});

test('question detection', () => {
  for (const q of ['explain', 'more context', '?', 'why?', 'What is this', 'can you explain this one']) {
    assert.equal(isQuestionReply(q), true, q);
  }
  for (const s of ['Approve it after staging passes', 'Wait until Monday', 'no']) {
    assert.equal(isQuestionReply(s), false, s);
  }
});

test('next-step line and box shape', () => {
  assert.equal(nextStepLine({ decision: 'reject' }), JB_TEXT.nextRejected);
  assert.equal(nextStepLine({ decision: 'option_0', choiceText: 'Apply Migration', owner: 'AXON Executive' }), 'The AXON Executive agent will pick this up now.');
  assert.equal(nextStepLine({ decision: 'approve', choiceText: 'Approve', owner: '' }), 'The team will pick this up now.');
  const lines = boxLines(['✅ GOT IT', 'You chose: Yes']).split('\n');
  assert.equal(lines.length, 4);
});

// Lint: no user-visible string on these paths may carry jargon.
const JARGON = [
  /\b[a-z]+_[a-z_]+\b/, // snake_case identifiers / table names
  /\b[0-9a-f]{8}-[0-9a-f]{4}-/i, // uuids
  /\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/, // ticket codes
  /\b(table|callback|dispatch|row|null|undefined|query|payload|webhook|api|sql|json|stack|exception|error code|unrecognized|table code)\b/i,
  /\.(m?js|ts|sql|json|md)\b/,
];

test('no jargon in any fixed user-facing string', () => {
  const samples = [
    ...Object.values(JB_TEXT),
    nextStepLine({ decision: 'reject' }),
    nextStepLine({ decision: 'approve', choiceText: 'Approve', owner: 'BUILD' }),
    nextStepLine({ decision: 'option_1', choiceText: 'Cancel', owner: 'COUNCIL' }),
    explainFromRow(makeRow({ jb_ask: null, title: 'W2-REVIEW-AXON-250 merge lib/foo.mjs' })),
  ];
  for (const s of samples) {
    for (const re of JARGON) assert.doesNotMatch(s, re, `jargon in: ${s}`);
  }
});
