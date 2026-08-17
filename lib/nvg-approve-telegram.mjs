/**
 * NVG approve/reject — generic tap-to-approve for agent_dispatch rows.
 * Ticket: AX-TELEGRAM-APPROVE-UX.
 *
 * Separate from the Content Machine "cm:" callback flow (content-machine-telegram.mjs)
 * — different callback_data prefix, different target table, does not touch that
 * code path at all. handleTelegramCallback in telegram-handler.mjs routes to
 * this module only when callback_data starts with "nvgapprove:".
 *
 * SCOPE, DELIBERATELY NARROW (v1):
 *   callback_data format: "nvgapprove:<table>:<id>:<approve|reject>"
 *   table whitelist: agent_dispatch only (Decisions-row support is a follow-up).
 *   approve: clears needs_jb_approval (boolean) ONLY on the target row. Never
 *     touches status, verification_status, or result_summary — those stay
 *     owned by whichever agent actually executes/verifies the ticket. This is
 *     the "never let a tap silently complete or bypass a gate" hard line from
 *     the ticket: a tap can clear "waiting on a human", nothing else.
 *   reject: the row is left untouched (needs_jb_approval stays true) so
 *     nothing auto-proceeds; the decision only lives in the log.
 *   Every inbound tap is logged to axon_telegram_messages BEFORE
 *     answerCallbackQuery is called, so an approval is provable, not claimed.
 */
import { telegramAnswerCallbackQuery } from './telegram.mjs';

const CALLBACK_RE = /^nvgapprove:([a-z_]+):([0-9a-fA-F-]+):(approve|reject)$/;
const ALLOWED_TABLES = new Set(['agent_dispatch']);
const JB_CONVERSATION_ID = 'a1d8c586-ce8e-4736-997d-648bb33e2872'; // from scripts/lib/jb-notify.mjs (nv-vault)

async function logInboundTap(sbInsert, { chatId, messageId, decision, table, targetId, valid, note }) {
  await sbInsert('axon_telegram_messages', {
    conversation_id: JB_CONVERSATION_ID,
    role: 'user',
    content: `[inbound tap] ${decision || 'unrecognized'} ${table || ''} ${targetId || ''}`.trim(),
    message_type: 'callback_query',
    telegram_message_id: messageId ?? null,
    metadata: { chat_id: chatId, decision, table, target_id: targetId, valid, note },
  });
}

/**
 * Handles a callback_query whose data starts with "nvgapprove:". Called from
 * handleTelegramCallback in telegram-handler.mjs — never called directly by
 * the webhook/poller.
 * @param {{ telegramToken: string, telegramChatId: string|number }} cfg
 * @param {{ sbSelect: Function, sbInsert: Function, sbPatch: Function }} sb
 * @param {object} callbackQuery
 */
export async function handleNvgApproveCallback(cfg, sb, callbackQuery) {
  const { sbInsert, sbPatch } = sb;
  const token = cfg.telegramToken;
  const queryId = callbackQuery.id;
  const chatId = String(callbackQuery.message?.chat?.id ?? '');
  const data = callbackQuery.data || '';
  const messageId = callbackQuery.message?.message_id;

  if (cfg.telegramChatId && chatId !== String(cfg.telegramChatId)) {
    await telegramAnswerCallbackQuery(token, queryId, 'Not authorized.');
    await logInboundTap(sbInsert, {
      chatId,
      messageId,
      decision: null,
      table: null,
      targetId: null,
      valid: false,
      note: 'chat_id_mismatch',
    });
    return null;
  }

  const match = CALLBACK_RE.exec(data);
  if (!match) {
    await telegramAnswerCallbackQuery(token, queryId, 'Unrecognized action.');
    await logInboundTap(sbInsert, {
      chatId,
      messageId,
      decision: null,
      table: null,
      targetId: null,
      valid: false,
      note: 'unparseable_callback_data',
    });
    return null;
  }

  const [, table, id, decision] = match;

  if (!ALLOWED_TABLES.has(table)) {
    await telegramAnswerCallbackQuery(token, queryId, `${table} not supported yet.`);
    await logInboundTap(sbInsert, {
      chatId,
      messageId,
      decision,
      table,
      targetId: id,
      valid: false,
      note: 'table_not_whitelisted',
    });
    return null;
  }

  // Log the tap BEFORE mutating anything — an approval must be provable even
  // if the follow-up write fails.
  await logInboundTap(sbInsert, {
    chatId,
    messageId,
    decision,
    table,
    targetId: id,
    valid: true,
    note: 'processing',
  });

  if (decision === 'approve') {
    // The ONLY write this handler ever performs on the target row: clear the
    // human-approval flag. Never sets status/verification_status/
    // result_summary — those stay owned by the executing/verifying agent.
    await sbPatch(table, `id=eq.${id}`, { needs_jb_approval: false });
    await telegramAnswerCallbackQuery(token, queryId, 'Approved.');
  } else {
    // Reject: deliberately does NOT mutate the row. needs_jb_approval stays
    // true so nothing auto-proceeds. The decision is provable via the log
    // row written above; a human/ARCEUS reads it and decides next action.
    await telegramAnswerCallbackQuery(token, queryId, 'Rejected — logged, row untouched.');
  }
  return true;
}
