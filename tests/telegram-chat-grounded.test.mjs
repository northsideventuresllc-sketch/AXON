#!/usr/bin/env node
/**
 * TELEGRAM-CHAT-GROUNDED-0906 — proof that JB's private Telegram chat answers
 * from the brain instead of thin air.
 *
 * The incident being fixed: JB asked "What needs me? Please ask" and got three
 * invented items back, then agreement with every push-back and nothing created.
 *
 * Offline: no network, no secrets. Everything is injected — sbSelect, sbInsert
 * and the router `generate` seam.
 *
 * Run: node --test tests/telegram-chat-grounded.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTEXT_CHAR_CAP,
  NOTHING_WAITING,
  answerWhatNeedsJb,
  asksWhatNeedsJb,
  buildJbChatContext,
} from '../lib/axon-jb-chat-context.mjs';
import { buildDispatchRow, classifyJbMessage, freeCode, pickOwner } from '../lib/axon-jb-instruction.mjs';
import { usableHistory } from '../lib/axon-telegram-chat.mjs';
import { answerJbChatMessage } from '../lib/axon-jb-chat.mjs';
import { telegramSend } from '../lib/telegram.mjs';

const NOW = new Date('2026-09-06T22:30:00Z');
const CFG = { supabaseKey: 'test-service-key' };

/** sbSelect stub: table -> rows. Anything unlisted comes back empty. */
function stubSelect(tables = {}) {
  const calls = [];
  const fn = async (table, filter = '') => {
    calls.push({ table, filter });
    const entry = tables[table];
    if (typeof entry === 'function') return entry(filter);
    return entry || [];
  };
  fn.calls = calls;
  return fn;
}

function stubInsert() {
  const rows = [];
  const fn = async (table, row) => {
    rows.push({ table, row });
    return { id: 'inserted', ...row };
  };
  fn.rows = rows;
  return fn;
}

function stubGenerate(text = 'answer') {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    return { text, provider: 'openrouter', model: 'test-model', source: 'test' };
  };
  fn.calls = calls;
  return fn;
}

const EMPTY_SB = { sbSelect: stubSelect(), sbInsert: stubInsert() };

test('"what needs me" is recognised, including JB\'s own wording', () => {
  assert.equal(asksWhatNeedsJb('What needs me? Please ask'), true);
  assert.equal(asksWhatNeedsJb('anything waiting on me?'), true);
  assert.equal(asksWhatNeedsJb('what do you need from me'), true);
  assert.equal(asksWhatNeedsJb('how many drafts are waiting?'), false);
});

test('empty brain: nothing is waiting, and no model is ever called', async () => {
  const generate = stubGenerate('should not be used');
  const out = await answerJbChatMessage(CFG, EMPTY_SB, {
    userMessage: 'What needs me? Please ask',
    now: NOW,
    generate,
  });
  assert.equal(out.reply, NOTHING_WAITING);
  assert.equal(out.route, 'needs-jb');
  assert.equal(generate.calls.length, 0, 'the answer comes from the rows, not a model');
});

test('waiting work is listed plainly, oldest first, with no codes or table names', async () => {
  const sbSelect = stubSelect({
    agent_dispatch: [
      {
        code: 'COUNCIL-JB-ROUTE-UNWIRED-0906',
        title: 'Council decisions never reach you — one answer unblocks the build',
        owner: 'BUILD',
        status: 'needs_jb',
        created_at: '2026-09-04T19:21:16Z',
      },
    ],
    axon_telegram_messages: (filter) =>
      filter.includes('approval_ping')
        ? [{
          content: 'Approve the second search key for research',
          metadata: { dispatch_id: 'abc-123', agent_name: 'SENSEI' },
          created_at: '2026-09-06T10:15:00Z',
        }, {
          content: 'Already answered this one',
          metadata: { dispatch_id: 'tapped-1', agent_name: 'BUILD' },
          created_at: '2026-09-05T10:15:00Z',
        }]
        : [{ metadata: { target_id: 'tapped-1', valid: true }, created_at: '2026-09-05T11:00:00Z' }],
  });

  const out = await answerJbChatMessage(CFG, { sbSelect, sbInsert: stubInsert() }, {
    userMessage: 'what needs me',
    now: NOW,
    generate: stubGenerate('unused'),
  });

  const lines = out.reply.split('\n');
  assert.equal(lines[0], '2 things need you.');
  assert.match(lines[1], /Council decisions never reach you/);
  assert.match(lines[1], /waiting 2 days/);
  assert.match(lines[2], /second search key/, 'the unanswered approval is listed');
  assert.doesNotMatch(out.reply, /Already answered/, 'a tapped approval is not re-listed');
  assert.doesNotMatch(out.reply, /COUNCIL-JB-ROUTE|agent_dispatch|axon_telegram_messages|needs_jb/);
});

test('a read that fails never reads back as "nothing is wrong"', async () => {
  const sbSelect = stubSelect({
    agent_dispatch: () => { throw new Error('PostgREST down'); },
  });
  const out = await answerJbChatMessage(CFG, { sbSelect, sbInsert: stubInsert() }, {
    userMessage: 'what needs me',
    now: NOW,
    generate: stubGenerate('unused'),
  });
  assert.match(out.reply, /don't have that in front of me/);
  assert.doesNotMatch(out.reply, new RegExp(NOTHING_WAITING));
});

test('an instruction becomes exactly one job, shaped to pass the spec gate', async () => {
  const sbInsert = stubInsert();
  const out = await answerJbChatMessage(CFG, { sbSelect: stubSelect(), sbInsert }, {
    userMessage: 'Fix the cron tab so it stops the Mac mini jobs too',
    now: NOW,
    generate: stubGenerate('should not be used'),
  });

  assert.equal(sbInsert.rows.length, 1, 'one job, not two, not zero');
  const { table, row } = sbInsert.rows[0];
  assert.equal(table, 'agent_dispatch');
  assert.equal(row.owner, 'EXEC');
  assert.equal(row.status, 'queued');
  assert.equal(row.action_class, 'code');
  assert.equal(row.queued_by, 'jb');
  assert.equal(row.source, 'JB via Telegram private chat');
  assert.equal(row.verification_spec.type, 'human_only');
  assert.match(row.verification_spec.params.reason, /JB asked for this in Telegram/);
  assert.match(row.code, /^TG-20260906-fix-the-cron-tab-so$/);
  assert.match(row.title, /Fix the cron tab/);
  assert.match(out.reply, /^Filed for EXEC\./);
});

test('a named agent owns it, and look-it-up work files as a question', () => {
  const row = buildDispatchRow('Investigate why SENSEI keeps missing findings', { now: NOW });
  assert.equal(row.owner, 'SENSEI');
  assert.equal(row.action_class, 'question');
  assert.equal(pickOwner('ask COUNCIL to weigh in'), 'COUNCIL');
});

test('unsure means one question back, never a speculative job', async () => {
  const sbInsert = stubInsert();
  for (const text of ['Can you fix the cron tab?', 'maybe update the research key at some point']) {
    const out = await answerJbChatMessage(CFG, { sbSelect: stubSelect(), sbInsert }, {
      userMessage: text,
      now: NOW,
      generate: stubGenerate('unused'),
    });
    assert.equal(out.route, 'clarify', text);
    assert.match(out.reply, /do you want it done now/);
  }
  assert.equal(sbInsert.rows.length, 0, 'nothing is filed while unsure');
  assert.equal(classifyJbMessage('that sounds about right to me'), 'chat');
});

test('anything else is answered by the model, bound to the live snapshot', async () => {
  const generate = stubGenerate('The research key is the only thing flagged.');
  const sbSelect = stubSelect({
    nvg_agent_routines: [{ agent_name: 'OUTREACH', health_status: 'degraded', health_note: 'no run since Friday' }],
    session_notes_apartment: [{
      raw_note: 'Closed the outreach receiver work and left the cron tab follow-ups open.',
      workspace_type: 'build-pass',
      created_at: '2026-09-06T16:00:00Z',
    }],
  });

  const out = await answerJbChatMessage(CFG, { sbSelect, sbInsert: stubInsert() }, {
    userMessage: 'how is the fleet doing',
    now: NOW,
    generate,
  });

  assert.equal(out.reply, 'The research key is the only thing flagged.');
  assert.equal(generate.calls.length, 1);
  const msgs = generate.calls[0].opts.messages;
  const system = msgs[0].content;
  assert.equal(msgs[0].role, 'system');
  assert.match(system, /You are AXON/);
  assert.doesNotMatch(system, /Outreach Assistant/, 'the narrow outreach identity is gone');
  assert.match(system, /I don't have that in front of me/, 'the fixed no-answer line is binding');
  assert.match(system, /Never agree with a claim you cannot see/);

  const handed = msgs.at(-1).content;
  assert.match(handed, /WAITING ON JB — tasks/);
  assert.match(handed, /WAITING ON JB — approvals/);
  assert.match(handed, /FLEET HEALTH/);
  assert.match(handed, /OUTREACH degraded|OUTREACH: degraded/);
  assert.match(handed, /LAST CLOSE-OUT/);
  assert.match(handed, /OUTREACH PIPELINE/);
});

test('the snapshot stays small even when the backlog is huge', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    code: `X-${i}`,
    title: 'A very long ticket title that goes on and on about everything it touches '.repeat(4),
    owner: 'BUILD',
    status: 'needs_jb',
    created_at: '2026-09-01T00:00:00Z',
  }));
  const facts = await buildJbChatContext(stubSelect({ agent_dispatch: many }), { now: NOW });
  assert.ok(facts.text.length <= CONTEXT_CHAR_CAP, `context was ${facts.text.length} chars`);
  assert.match(facts.text, /WAITING ON JB — tasks/);
  assert.equal(facts.needsJb.length, 12);
  assert.ok(facts.needsJb[0].label.length <= 141, 'each title is clipped');
});

test('the counted answer matches the rows it was built from', () => {
  const facts = {
    waiting: [{ label: 'One open thing', owner: 'BUILD', ageDays: 3 }],
    failures: 0,
  };
  assert.match(answerWhatNeedsJb(facts), /^One thing needs you\.\nOne open thing — BUILD is holding it, waiting 3 days\./);
});

test('JB\'s chat hears AXON plainly — the outreach tag is gone from his replies', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };
  try {
    await telegramSend('t', '1', 'Nothing is waiting on you right now.', false, { untagged: true });
    await telegramSend('t', '1', 'Three drafts are waiting.', false);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent[0].text, 'Nothing is waiting on you right now.');
  assert.doesNotMatch(sent[0].text, /\[AXON/);
  assert.equal(sent[1].text, '[AXON — Outreach] Three drafts are waiting.', 'other senders keep their tag');
});

test('a block that could not be read never renders as an empty one', async () => {
  const sbSelect = stubSelect({
    session_notes_apartment: () => { throw new Error('read failed'); },
  });
  const facts = await buildJbChatContext(sbSelect, {
    now: NOW,
    pipelineContext: '',
    pipelineFailed: true,
  });
  const closeOutBlock = facts.text.split('\n\n').find((b) => b.startsWith('LAST CLOSE-OUT'));
  const pipelineBlock = facts.text.split('\n\n').find((b) => b.startsWith('OUTREACH PIPELINE'));
  assert.match(closeOutBlock, /could not be read this time/);
  assert.doesNotMatch(closeOutBlock, /\(nothing\)/);
  assert.match(pipelineBlock, /could not be read this time/);
  assert.doesNotMatch(pipelineBlock, /\(nothing\)/);
  assert.equal(facts.failed.closeOut, true);
  assert.equal(facts.failed.pipeline, true);
});

test('a half-read list says so, even when the other half has items', async () => {
  const sbSelect = stubSelect({
    agent_dispatch: [{
      code: 'X-1',
      title: 'Council decisions never reach you',
      owner: 'BUILD',
      status: 'needs_jb',
      created_at: '2026-09-04T10:00:00Z',
    }],
    axon_telegram_messages: () => { throw new Error('read failed'); },
  });
  const out = await answerJbChatMessage(CFG, { sbSelect, sbInsert: stubInsert() }, {
    userMessage: 'what needs me',
    now: NOW,
    generate: stubGenerate('unused'),
  });
  assert.match(out.reply, /Council decisions never reach you/);
  assert.match(out.reply, /I could not read the approvals this time, so this may be incomplete\./);
});

test('two instructions on one day get two different jobs, not one lost one', async () => {
  const existing = new Set(['TG-20260906-fix-the-cron-tab-so']);
  const sbSelect = stubSelect({
    agent_dispatch: (filter) => {
      const asked = decodeURIComponent((filter.match(/code=eq\.([^&]+)/) || [])[1] || '');
      return existing.has(asked) ? [{ code: asked }] : [];
    },
  });
  const sbInsert = stubInsert();
  const out = await answerJbChatMessage(CFG, { sbSelect, sbInsert }, {
    userMessage: 'Fix the cron tab so it stops the Mac mini jobs too',
    now: NOW,
    generate: stubGenerate('unused'),
  });
  assert.equal(sbInsert.rows.length, 1);
  assert.equal(sbInsert.rows[0].row.code, 'TG-20260906-fix-the-cron-tab-so-2');
  assert.match(out.reply, /^Filed for EXEC\./);
  assert.equal(await freeCode(sbSelect, 'TG-20260906-something-else'), 'TG-20260906-something-else');
});

test('the invented replies from the incident can never be quoted back', () => {
  const history = [
    { role: 'user', content: 'What needs me? Please ask', created_at: '2026-09-06T22:27:00Z' },
    { role: 'assistant', content: 'The cursor text issue — root cause identified.', created_at: '2026-09-06T22:28:00Z' },
    { role: 'assistant', content: 'Fresh, real answer.', created_at: '2026-09-08T09:00:00Z' },
  ];
  const kept = usableHistory(history);
  assert.equal(kept.length, 2);
  assert.ok(!kept.some((m) => /root cause identified/.test(m.content)), 'the invented turn is dropped');
  assert.ok(kept.some((m) => m.content === 'Fresh, real answer.'));
  const long = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  assert.equal(usableHistory(long).length, 6, 'only the last few turns travel');
});

test('history is not treated as evidence in the system prompt', async () => {
  const generate = stubGenerate('ok');
  await answerJbChatMessage(CFG, EMPTY_SB, {
    userMessage: 'how is the fleet doing',
    now: NOW,
    generate,
  });
  const system = generate.calls[0].opts.messages[0].content;
  assert.match(system, /Earlier messages in this chat are NOT evidence/);
  assert.match(system, /Answer ONLY from the CONTEXT section\./);
});
