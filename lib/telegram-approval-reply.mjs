/**
 * TELEGRAM-APPROVAL-REPLY — Handles JB's direct replies to approval cards in Telegram.
 *
 * When JB replies to an approval card or notification with extra context, conditions,
 * or questions, this handler:
 * 1. Matches the replied-to message in axon_telegram_messages (with fallback).
 * 2. Attaches JB's feedback/instructions directly to the agent_dispatch row.
 * 3. Dispatches an urgent notification on agent_bus to the owning agent.
 * 4. Generates an ADHD-friendly, context-grounded response explaining the task or confirming feedback.
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

  // Fallback lookup: if telegram_message_id wasn't backfilled, find the most recent approval ping
  if (!originalMsg) {
    try {
      const fallbackRows = await sbSelect(
        'axon_telegram_messages',
        `message_type=in.(approval_ping,needs_approval)&order=created_at.desc&limit=3&select=*`
      );
      originalMsg = fallbackRows?.[0] ?? null;
    } catch (e) {
      console.warn('handleTelegramApprovalReply: fallback lookup failed:', e.message);
    }
  }

  const meta = originalMsg?.metadata || {};
  let dispatchId = meta.dispatch_id || meta.target_id || null;
  const agentName = meta.agent_name || 'EXEC';

  let dispatchRow = null;
  if (dispatchId) {
    try {
      const rows = await sbSelect(
        'agent_dispatch',
        `id=eq.${dispatchId}&select=id,code,title,owner,result_summary,status,jb_ask,jb_options,risk_tier&limit=1`
      );
      dispatchRow = rows?.[0] ?? null;
    } catch (err) {
      console.warn('handleTelegramApprovalReply: could not fetch dispatch row:', err.message);
    }
  }

  // Fallback 2: Check latest pending agent_dispatch if still unlinked
  if (!dispatchRow) {
    try {
      const pendingRows = await sbSelect(
        'agent_dispatch',
        'needs_jb_approval=eq.true&status=neq.done&order=created_at.desc&limit=1&select=id,code,title,owner,result_summary,status,jb_ask,jb_options,risk_tier'
      );
      if (pendingRows?.[0]) {
        dispatchRow = pendingRows[0];
        dispatchId = dispatchRow.id;
      }
    } catch {}
  }

  const nowIso = new Date().toISOString();
  const targetOwner = dispatchRow?.owner || agentName;
  const itemTitle = dispatchRow?.title || originalMsg?.content || 'this task';

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

  // 4. Formulate clean ADHD plain-English response
  const { axonChatReply } = await import('./axon-telegram-chat.mjs');
  let reply = `Noted for ${targetOwner}: ${itemTitle.slice(0, 70)}. What else do you need?`;
  try {
    const conversationId = originalMsg?.conversation_id || 'a1d8c586-ce8e-4736-997d-648bb33e2872';
    const historyRows = await sbSelect(
      'axon_telegram_messages',
      `conversation_id=eq.${conversationId}&order=created_at.desc&limit=16`
    );
    const history = (historyRows || []).reverse().filter(h => h.role === 'user' || h.role === 'assistant');
    
    const optionsText = dispatchRow?.jb_options?.length 
      ? `Options available: ${JSON.stringify(dispatchRow.jb_options)}` 
      : 'Options available: Approve or Reject';

    const contextFacts = `The operator (JB) is replying to an active agent approval/notification in Telegram:
Task Code: ${dispatchRow?.code || 'N/A'}
Task Title: ${dispatchRow?.title || 'N/A'}
Owner / Agent: ${targetOwner}
Current Question/Ask: ${dispatchRow?.jb_ask || originalMsg?.content || 'Approval requested'}
${optionsText}
Task Details & History: ${dispatchRow?.result_summary || 'Pending operator review'}

INSTRUCTIONS:
- If JB asks "needs more context", "what is this", "explain", or asks questions: Explain what this task is, why it is needed, who is doing it, and what the choices or next steps are. Keep it in clear, direct ADHD-friendly plain English (no code jargon, no file paths, no stack traces).
- If JB provides feedback, instructions, or a decision: Confirm clearly that the instruction was saved and routed to ${targetOwner}.`;

    reply = await axonChatReply(cfg, {
      userMessage: userText,
      history,
      context: contextFacts,
      sbSelect,
      topicAgent: targetOwner
    });
  } catch(e) {
    console.error('handleTelegramApprovalReply: LLM failed, using fallback.', e);
  }

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
  const convId = originalMsg?.conversation_id || 'a1d8c586-ce8e-4736-997d-648bb33e2872';
  try {
    await sbInsert('axon_telegram_messages', {
      conversation_id: convId,
      role: 'user',
      content: userText,
      message_type: 'approval_reply',
      telegram_message_id: msg.message_id,
      metadata: {
        chat_id: chatId,
        thread_id: threadId ?? null,
        reply_to_telegram_message_id: replyToId,
        dispatch_id: dispatchId,
        agent_name: targetOwner,
        captured_at: nowIso,
      },
    });
  } catch (e) {
    console.warn('handleTelegramApprovalReply: failed to log message:', e.message);
  }

  // Log assistant reply
  try {
    await sbInsert('axon_telegram_messages', {
      conversation_id: convId,
      role: 'assistant',
      content: reply,
      message_type: 'approval_reply_assistant',
      metadata: { dispatch_id: dispatchId, thread_id: threadId ?? null },
    });
  } catch (e) {}

  return reply;
}
