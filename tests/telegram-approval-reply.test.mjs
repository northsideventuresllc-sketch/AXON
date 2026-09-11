import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRepliedMessageId,
  handleTelegramApprovalReply,
} from '../lib/telegram-approval-reply.mjs';

test('getRepliedMessageId: extracts message_id if reply_to_message is present', () => {
  assert.equal(getRepliedMessageId({}), null);
  assert.equal(getRepliedMessageId({ text: 'hello' }), null);
  assert.equal(
    getRepliedMessageId({ text: 'yes', reply_to_message: { message_id: 12345 } }),
    12345
  );
});

test('handleTelegramApprovalReply: ignores messages that are not replies', async () => {
  const cfg = { dryRun: true };
  const sb = {
    sbSelect: async () => [],
    sbInsert: async () => {},
    sbPatch: async () => {},
  };
  const result = await handleTelegramApprovalReply(cfg, sb, {
    chatId: '100',
    chat: { id: 100 },
    text: 'just random text',
  });
  assert.equal(result, null);
});

test('handleTelegramApprovalReply: enriches agent_dispatch and notifies agent_bus', async () => {
  const cfg = { dryRun: true, telegramToken: 'fake-token' };
  
  const originalMsgId = 999;
  const dispatchId = 'disp-1234-uuid';
  
  const patchedDispatch = [];
  const insertedBus = [];
  const insertedMessages = [];

  const sb = {
    sbSelect: async (table, query) => {
      if (table === 'axon_telegram_messages') {
        return [
          {
            id: 'orig-msg-1',
            conversation_id: 'conv-1',
            telegram_message_id: originalMsgId,
            content: '🟡 Deploy pricing changes to main',
            metadata: {
              dispatch_id: dispatchId,
              agent_name: 'BUILD',
            },
          },
        ];
      }
      if (table === 'agent_dispatch') {
        return [
          {
            id: dispatchId,
            code: 'TG-20260911-pricing',
            title: 'Deploy pricing changes to main',
            owner: 'BUILD',
            result_summary: 'Pending approval',
            status: 'needs_jb',
          },
        ];
      }
      return [];
    },
    sbPatch: async (table, filter, data) => {
      if (table === 'agent_dispatch') {
        patchedDispatch.push({ filter, data });
      }
    },
    sbInsert: async (table, data) => {
      if (table === 'agent_bus') {
        insertedBus.push(data);
      }
      if (table === 'axon_telegram_messages') {
        insertedMessages.push(data);
      }
    },
  };

  const incomingMsg = {
    message_id: 1000,
    chat: { id: -1001234567 },
    message_thread_id: 55,
    text: 'Approve only after running integration tests on staging first',
    reply_to_message: {
      message_id: originalMsgId,
    },
  };

  const reply = await handleTelegramApprovalReply(cfg, sb, incomingMsg);

  assert.ok(reply, 'should return a reply');
  assert.ok(reply.includes('Noted for BUILD'), 'reply mentions owning agent');
  assert.ok(reply.includes('Deploy pricing changes to main'), 'reply mentions task title');

  // Verify agent_dispatch patch
  assert.equal(patchedDispatch.length, 1);
  assert.ok(patchedDispatch[0].data.result_summary.includes('Approve only after running integration tests'));

  // Verify agent_bus notification
  assert.equal(insertedBus.length, 1);
  assert.equal(insertedBus[0].to_agent, 'BUILD');
  assert.ok(insertedBus[0].body.includes('Approve only after running integration tests'));

  // Verify log message
  assert.equal(insertedMessages.length, 1);
  assert.equal(insertedMessages[0].message_type, 'approval_reply');
});
