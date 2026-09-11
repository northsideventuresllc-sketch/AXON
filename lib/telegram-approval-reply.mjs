/**
 * TELEGRAM-APPROVAL-REPLY — Handles JB's direct replies to approval cards in Telegram.
 *
 * When JB replies to an approval card or notification with extra context, conditions,
 * or questions, this handler:
 * 1. Matches the replied-to message in axon_telegram_messages.
 * 2. Attaches JB's feedback/instructions directly to the agent_dispatch row.
 * 3. Dispatches an urgent notification on agent_bus to the owning agent.
 * 4. Sends a plain-English ADHD-formatted confirmation back to JB in the thread.
 */
import { telegramSend } from './telegram.mjs';

/**
 * Checks if an inbound Telegram message is a reply to an existing message.
 * @param {object} msg - The Telegram message object.
 * @returns {number|null} The replied-to message_id, if present.
 */
export function getRepliedMessageId(msg) {
  return msg?.reply_to_message?.message_id ?? null;
}

/**
 * Handle a reply to an approval card or notification.
 * @param {object} cfg
 * @param {{ sbSelect: Function, sbInsert: Function, sbPatch: Function }} sb
 * @param {object} msg - The Telegram message object from webhook/poller.
 * @returns {Promise<string|null>} The reply text sent to JB, or null if not a handled reply.
 */
export async function handleTelegramApprovalReply(cfg, sb, msg) {
  const replyToId = getRepliedMessageId(msg);
  if (!replyToId) return null;

  const { sbSelect, sbInsert, sbPatch } = sb;
  const chatId = String(msg.chat.id);
  const threadId = msg.message_thread_id ?? undefined;
  const userText = msg.text?.trim() || '';

  if (!userText) return null;

  // 1. Look up the original message in axon_telegram_messages
  let originalMsg = null;
  try {
    const rows = await sbSelect(
      'axon_telegram_messages',
      `telegram_message_id=eq.${replyToId}&select=*&limit=1`
    );
    originalMsg = rows?.[0] ?? null;
  } catch (err) {
    console.error('handleTelegramApprovalReply: failed to find original message:', err.message);
  }

  if (!originalMsg) {
    // If not found in DB, we cannot identify the exact ticket
    return null;
  }

  const meta = originalMsg.metadata || {};
  const dispatchId = meta.dispatch_id || meta.target_id || null;
  const agentName = meta.agent_name || 'EXEC';

  let dispatchRow = null;
  if (dispatchId) {
    try {
      const rows = await sbSelect(
        'agent_dispatch',
        `id=eq.${dispatchId}&select=id,code,title,owner,result_summary,status&limit=1`
      );
      dispatchRow = rows?.[0] ?? null;
    } catch (err) {
      console.warn('handleTelegramApprovalReply: could not fetch dispatch row:', err.message);
    }
  }

  const nowIso = new Date().toISOString();
  const targetOwner = dispatchRow?.owner || agentName;
  const itemTitle = dispatchRow?.title || originalMsg.content || 'this task';

  // 2. If dispatch row exists, update it with JB's context/instructions
  if (dispatchRow) {
    const existingSummary = dispatchRow.result_summary || '';
    const updatedSummary = `[JB feedback ${nowIso}]: "${userText}"${existingSummary ? ` | ${existingSummary}` : ''}`;
    
    try {
      await sbPatch('agent_dispatch', `id=eq.${dispatchRow.id}`, {
        result_summary: updatedSummary,
      });
    } catch (err) {
      console.error('handleTelegramApprovalReply: failed to patch agent_dispatch:', err.message);
    }
  }

  // 3. Post urgent notification to agent_bus for the owning agent
  try {
    await sbInsert('agent_bus', {
      from_agent: 'JB (Telegram Reply)',
      to_agent: targetOwner,
      subject: `JB gave instructions for ${dispatchRow?.code || 'pending approval'}`,
      body: `JB replied in Telegram:\n"${userText}"\n\nTask: ${itemTitle}`,
      priority: 'urgent',
    });
  } catch (err) {
    console.warn('handleTelegramApprovalReply: failed to insert into agent_bus:', err.message);
  }

  // 4. Formulate clean ADHD plain-English confirmation
  const shortTitle = itemTitle.slice(0, 70).replace(/[\r\n]+/g, ' ');
  const reply = `✍️ <b>Noted for ${targetOwner}</b>\n• Added your instructions to <b>${shortTitle}</b>.\n• ${targetOwner} will follow this when executing.`;

  if (!cfg.dryRun) {
    try {
      await telegramSend(cfg.telegramToken, chatId, reply, false, {
        threadId,
        untagged: true,
      });
    } catch (err) {
      console.error('handleTelegramApprovalReply: failed to send reply:', err.message);
    }
  }

  // 5. Log the user reply to axon_telegram_messages
  try {
    await sbInsert('axon_telegram_messages', {
      conversation_id: originalMsg.conversation_id || 'a1d8c586-ce8e-4736-997d-648bb33e2872',
      role: 'user',
      content: userText,
      message_type: 'approval_reply',
      telegram_message_id: msg.message_id,
      metadata: {
        chat_id: chatId,
        reply_to_telegram_message_id: replyToId,
        dispatch_id: dispatchId,
        agent_name: targetOwner,
        captured_at: nowIso,
      },
    });
  } catch (e) {
    console.warn('handleTelegramApprovalReply: failed to log message:', e.message);
  }

  return reply;
}
