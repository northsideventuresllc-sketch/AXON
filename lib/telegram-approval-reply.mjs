/**
 * TELEGRAM-APPROVAL-REPLY — Handles JB's typed replies to approval cards in Telegram.
 *
 * P2-ACK (2026-09-24): JB must ALWAYS know his reply got through.
 *
 * Only a reply to a LOGGED approval card is handled here (the replied-to
 * message_id matches an axon_telegram_messages row that carries a dispatch_id).
 * A reply to anything else returns null so the normal chat flow (and the
 * instruction-change note capture) handles it — the old "attach it to the most
 * recent pending approval" fallback could file JB's words against the wrong task.
 *
 * For a card reply:
 *   - Instruction / feedback: prepended to agent_dispatch.result_summary (the
 *     table has no notes/answer column — checked live 2026-09-24), the owning
 *     agent is told on agent_bus, and JB's message gets a reply with a boxed
 *     "✅ GOT YOUR REPLY" plus one line on what was saved and who acts on it.
 *     If the save fails, the reply says so and asks him to send it again.
 *   - Question ("explain", "more context", "?"): answered in plain English from
 *     the card's dispatch row, then the buttons are shown again (unless the card
 *     was already answered). The re-shown card is logged so a tap or reply on
 *     it works exactly like the original.
 */
import { telegramSendHtml } from './telegram.mjs';
import {
  JB_TEXT,
  alreadyAnsweredText,
  approvalKeyboard,
  boxHtml,
  escapeHtml,
  explainFromRow,
  friendlyOwner,
  isQuestionReply,
  plainEnglish,
  priorChoice,
} from './telegram-jb-receipts.mjs';

const JB_CONVERSATION_ID = 'a1d8c586-ce8e-4736-997d-648bb33e2872';
const CARD_MESSAGE_TYPES = ['approval_ping', 'approval_card_reshow', 'needs_approval'];
const DISPATCH_SELECT = 'id,code,title,owner,result_summary,status,jb_ask,jb_options,risk_tier,needs_jb_approval';

/**
 * Checks if an inbound Telegram message is a reply to an existing message.
 * @param {object} msg - The Telegram message object.
 * @returns {number|null} The replied-to message_id, if present.
 */
export function getRepliedMessageId(msg) {
  return msg?.reply_to_message?.message_id ?? null;
}

function normalizeCardText(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the logged approval card JB replied to. Exact match on the Telegram
 * message id first; if the sender hasn't backfilled that id yet (it is filled
 * on the sender's next run), match a not-yet-backfilled card by its text.
 */
export async function findRepliedCard(sbSelect, msg) {
  const replyToId = getRepliedMessageId(msg);
  if (!replyToId) return null;
  try {
    const rows = await sbSelect(
      'axon_telegram_messages',
      `telegram_message_id=eq.${replyToId}&select=*&order=created_at.desc&limit=5`,
    );
    const hit = (rows || []).find(
      (r) => r?.metadata?.dispatch_id && CARD_MESSAGE_TYPES.includes(r.message_type),
    );
    if (hit) return hit;
  } catch (err) {
    console.error('handleTelegramApprovalReply: card lookup failed:', err.message);
  }

  const repliedText = normalizeCardText(msg.reply_to_message?.text);
  if (!/needs your approval/i.test(repliedText)) return null;
  try {
    const rows = await sbSelect(
      'axon_telegram_messages',
      'message_type=eq.approval_ping&telegram_message_id=is.null&order=created_at.desc&limit=10&select=*',
    );
    return (rows || []).find((r) => r?.metadata?.dispatch_id && normalizeCardText(r.content) === repliedText) ?? null;
  } catch (err) {
    console.warn('handleTelegramApprovalReply: text-match lookup failed:', err.message);
    return null;
  }
}

/** Default explainer: a model answer grounded in the row, falling back to a
 * plain summary built straight from the row. Always run through plainEnglish. */
async function defaultExplain(cfg, { row, userText, sbSelect }) {
  const fallback = explainFromRow(row);
  try {
    const { axonChatReply } = await import('./axon-telegram-chat.mjs');
    const opts = Array.isArray(row?.jb_options) && row.jb_options.length ? row.jb_options : ['Approve', 'Reject'];
    const context = `JB is asking about an approval card he received.
Question on the card: ${row?.jb_ask || row?.title || 'Approval requested'}
Task: ${row?.title || 'unknown'}
Agent waiting on him: ${row?.owner || 'the team'}
His choices: ${opts.join(' / ')}
Notes so far: ${row?.result_summary || 'none'}

Explain in 2-4 short plain-English sentences what this is, why it matters, and what each choice does. No code, no file names, no task codes.`;
    const reply = await axonChatReply(cfg, { userMessage: userText, context, sbSelect, topicAgent: row?.owner || null });
    const clean = plainEnglish(reply);
    return clean || fallback;
  } catch (err) {
    console.warn('handleTelegramApprovalReply: explanation model failed, using the row summary:', err.message);
    return fallback;
  }
}

async function safeInsert(sbInsert, table, row) {
  try {
    return await sbInsert(table, row);
  } catch (err) {
    console.warn(`handleTelegramApprovalReply: insert into ${table} failed:`, err.message);
    return null;
  }
}

/**
 * Handle a reply to an approval card.
 * @param {object} cfg
 * @param {{ sbSelect: Function, sbInsert: Function, sbPatch: Function }} sb
 * @param {object} msg - The Telegram message object from webhook/poller.
 * @param {{ explain?: Function }} [deps] - injectable for tests.
 * @returns {Promise<string|null>} The text sent to JB, or null if this is not a reply to a card.
 */
export async function handleTelegramApprovalReply(cfg, sb, msg, deps = {}) {
  const replyToId = getRepliedMessageId(msg);
  if (!replyToId) return null;
  const userText = msg.text?.trim() || '';
  if (!userText) return null;

  const { sbSelect, sbInsert, sbPatch } = sb;
  const card = await findRepliedCard(sbSelect, msg);
  if (!card) return null;

  const chatId = String(msg.chat.id);
  const threadId = msg.message_thread_id ?? undefined;
  const nowIso = new Date().toISOString();
  const convId = card.conversation_id || JB_CONVERSATION_ID;
  const dispatchId = card.metadata.dispatch_id;
  const explain = deps.explain || defaultExplain;

  let row = null;
  try {
    const rows = await sbSelect('agent_dispatch', `id=eq.${dispatchId}&select=${DISPATCH_SELECT}&limit=1`);
    row = rows?.[0] ?? null;
  } catch (err) {
    console.warn('handleTelegramApprovalReply: could not fetch the card\'s task:', err.message);
  }
  const owner = row?.owner || card.metadata.agent_name || null;
  const question = isQuestionReply(userText);

  await safeInsert(sbInsert, 'axon_telegram_messages', {
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
      agent_name: owner,
      kind: question ? 'question' : 'instruction',
      captured_at: nowIso,
    },
  });

  let plain;
  let html;
  let replyMarkup;
  let reshown = false;

  if (question && row) {
    const explanation = await explain(cfg, { row, userText, sbSelect });
    const prior = priorChoice(row);
    const tail = prior
      ? `${JB_TEXT.explainAlreadyAnswered} ${alreadyAnsweredText(prior)}`
      : JB_TEXT.explainChooseBelow;
    plain = `${explanation}\n\n${tail}`;
    html = escapeHtml(plain);
    if (!prior) {
      replyMarkup = approvalKeyboard(row.id, row.jb_options);
      reshown = true;
    }
  } else {
    let saved = false;
    if (row) {
      const existing = row.result_summary || '';
      const updated = `[JB feedback ${nowIso}]: "${userText}"${existing ? ` | ${existing}` : ''}`;
      try {
        await sbPatch('agent_dispatch', `id=eq.${row.id}`, { result_summary: updated });
        saved = true;
      } catch (err) {
        console.error('handleTelegramApprovalReply: saving the reply failed:', err.message);
      }
    }

    if (row && !saved) {
      plain = `${JB_TEXT.replyFailed} ${JB_TEXT.replySendAgain}`;
      html = boxHtml([JB_TEXT.replyFailed, JB_TEXT.replySendAgain]);
    } else {
      await safeInsert(sbInsert, 'agent_bus', {
        from_agent: 'JB (Telegram Reply)',
        to_agent: owner || 'EXEC',
        subject: `JB replied to the approval card for ${row?.code || 'a pending task'}`,
        body: `JB replied in Telegram:\n"${userText}"\n\nTask: ${row?.title || card.content || 'unknown'}`,
        priority: 'urgent',
      });
      const topic = plainEnglish(row?.jb_ask || row?.title || '').slice(0, 70);
      const summary = row
        ? `${JB_TEXT.replySavedPrefix} "${topic}": "${userText.slice(0, 80)}".`
        : JB_TEXT.replyNoCard;
      const who = row ? `${friendlyOwner(owner)} ${JB_TEXT.replyWhoActs}` : '';
      plain = [JB_TEXT.gotReply, summary, who].filter(Boolean).join('\n');
      html = [boxHtml([JB_TEXT.gotReply]), escapeHtml(summary), escapeHtml(who)].filter(Boolean).join('\n');
    }
  }

  let sentId = null;
  if (!cfg.dryRun) {
    try {
      const sent = await telegramSendHtml(cfg.telegramToken, chatId, html, {
        threadId,
        replyToMessageId: msg.message_id,
        replyMarkup,
      });
      sentId = sent?.result?.message_id ?? null;
    } catch (err) {
      console.error('handleTelegramApprovalReply: failed to send the confirmation:', err.message);
    }
  }

  await safeInsert(sbInsert, 'axon_telegram_messages', {
    conversation_id: convId,
    role: 'assistant',
    content: plain,
    // A re-shown card is logged like a card so a tap or reply on it resolves
    // to the same task.
    message_type: reshown ? 'approval_card_reshow' : 'approval_reply_assistant',
    telegram_message_id: sentId,
    metadata: { dispatch_id: dispatchId, agent_name: owner, thread_id: threadId ?? null },
  });

  return plain;
}
