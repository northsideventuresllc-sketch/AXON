/**
 * NVG approve/reject — generic tap-to-approve for agent_dispatch rows.
 * Ticket: AX-TELEGRAM-APPROVE-UX.
 *
 * Separate from the Content Machine "cm:" callback flow (content-machine-telegram.mjs)
 * — different callback_data prefix, different target table, does not touch that
 * code path at all. handleTelegramCallback in telegram-handler.mjs routes to
 * this module only when callback_data starts with "nvga:" (shortened from the
 * original "nvgapprove:" prefix — see the byte-limit note below).
 *
 * SCOPE, DELIBERATELY NARROW (v1):
 *   callback_data format: "nvga:<table-code>:<id>:<a|r>"
 *   table whitelist: agent_dispatch only (Decisions-row support is a follow-up).
 *   approve: clears needs_jb_approval, sets status='queued', and stamps when
 *     JB approved it (see the `jb_approved_at` note in handleNvgApproveCallback).
 *   reject: sets status='rejected'. needs_jb_approval is left as-is either way —
 *     the decision is provable via the log row written before either write.
 *   Every inbound tap is logged to axon_telegram_messages BEFORE
 *     answerCallbackQuery is called, so an approval is provable, not claimed.
 *   After either decision, the inline keyboard on the tapped message is
 *     removed (editMessageReplyMarkup) so a second tap is impossible.
 */
import { telegramAnswerCallbackQuery, telegramEditMessageReplyMarkup } from './telegram.mjs';

// Telegram callback_data is capped at 64 bytes - nvgapprove:agent_dispatch:<uuid>:approve
// (70 chars) blew that limit (BUTTON_DATA_INVALID). Shortened format:
// nvga:<table-code>:<uuid>:<a|r> - well under the limit, still extensible to more tables.
const CALLBACK_RE = /^nvga:([a-z]):([0-9a-fA-F-]+):(a|r)$/;
const TABLE_CODES = { d: 'agent_dispatch' };
const DECISION_CODES = { a: 'approve', r: 'reject' };
const JB_CONVERSATION_ID = 'a1d8c586-ce8e-4736-997d-648bb33e2872'; // from scripts/lib/jb-notify.mjs (nv-vault)

async function logInboundTap(sbInsert, { chatId, messageId, decision, table, targetId, valid, note }) {
  await sbInsert('axon_telegram_messages', {
    conversation_id: JB_CONVERSATION_ID,
    role: 'user',
    content: `[inbound tap] ${decision || 'unrecognized'} ${table || ''} ${targetId || ''}`.trim(),
    message_type: 'approval_tap',
    telegram_message_id: messageId ?? null,
    metadata: { chat_id: chatId, decision, table, target_id: targetId, valid, note },
  });
}

/**
 * Handles a callback_query whose data starts with "nvga:". Called from
 * handleTelegramCallback in telegram-handler.mjs — never called directly by
 * the webhook/poller.
 * @param {{ telegramToken: string, telegramChatId: string|number, telegramApprovalsThreadId?: string|number|null }} cfg
 * @param {{ sbSelect: Function, sbInsert: Function, sbPatch: Function }} sb — sbSelect is
 *   used to read the row's existing result_summary before stamping it on approve.
 * @param {object} callbackQuery
 */
export async function handleNvgApproveCallback(cfg, sb, callbackQuery) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const token = cfg.telegramToken;
  const queryId = callbackQuery.id;
  const chatId = String(callbackQuery.message?.chat?.id ?? '');
  const threadId = callbackQuery.message?.message_thread_id != null
    ? String(callbackQuery.message.message_thread_id)
    : null;
  const data = callbackQuery.data || '';
  const messageId = callbackQuery.message?.message_id;

  const allowedChats = [cfg.telegramChatId, cfg.telegramDmChatId, cfg.telegramGroupChatId]
    .filter((v) => v != null && v !== '')
    .map(String);
  if (allowedChats.length && !allowedChats.includes(chatId)) {
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

  // The NVG Agents group carries one topic per agent plus a shared JB Approvals
  // topic — once that topic is provisioned (cfg.telegramApprovalsThreadId), a tap
  // must come from it specifically, not just from anywhere in the same group.
  // Taps from JB's private chat carry no topic and are accepted as-is; taps
  // from the group must come from the JB Approvals topic specifically.
  const groupId = cfg.telegramGroupChatId || cfg.telegramChatId;
  const inGroup = cfg.telegramApprovalsThreadId && groupId && chatId === String(groupId)
    && !(cfg.telegramDmChatId && chatId === String(cfg.telegramDmChatId));
  if (inGroup && threadId !== String(cfg.telegramApprovalsThreadId)) {
    await telegramAnswerCallbackQuery(token, queryId, 'Not authorized.');
    await logInboundTap(sbInsert, {
      chatId,
      messageId,
      decision: null,
      table: null,
      targetId: null,
      valid: false,
      note: 'thread_id_mismatch',
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

  const [, tableCode, id, decisionCode] = match;
  const table = TABLE_CODES[tableCode];
  const decision = DECISION_CODES[decisionCode];

  if (!table) {
    await telegramAnswerCallbackQuery(token, queryId, `Unknown table code ${tableCode}.`);
    await logInboundTap(sbInsert, {
      chatId,
      messageId,
      decision,
      table: tableCode,
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
    // Approve: clear the human-approval flag, release the row into the queue,
    // and record when JB approved it. `jb_approved_at` is not a known column
    // on agent_dispatch (checked: no reference anywhere in this repo) — so the
    // timestamp is recorded by prefixing result_summary instead, noted as such,
    // rather than guessing at a column that may not exist.
    const nowIso = new Date().toISOString();
    let existingSummary = null;
    try {
      const rows = await sbSelect(table, `id=eq.${id}&select=result_summary&limit=1`);
      existingSummary = rows?.[0]?.result_summary ?? null;
    } catch {
      existingSummary = null;
    }
    const stampedSummary = `[JB approved ${nowIso}]${existingSummary ? ` ${existingSummary}` : ''}`;
    await sbPatch(table, `id=eq.${id}`, {
      needs_jb_approval: false,
      status: 'queued',
      result_summary: stampedSummary,
    });
    await telegramAnswerCallbackQuery(token, queryId, 'Approved.');
  } else {
    // Reject: mark the row rejected so nothing auto-proceeds. The decision is
    // also provable via the log row written above.
    await sbPatch(table, `id=eq.${id}`, { status: 'rejected' });
    await telegramAnswerCallbackQuery(token, queryId, 'Rejected.');
  }

  // Remove the inline keyboard on the tapped message so a second tap on the
  // same message is impossible. Best-effort — a failure here must never
  // undo the approve/reject write or the answerCallbackQuery above.
  if (messageId != null) {
    try {
      await telegramEditMessageReplyMarkup(token, chatId, messageId);
    } catch (err) {
      console.warn(`nvg-approve-telegram: editMessageReplyMarkup failed: ${err.message}`);
    }
  }

  return true;
}
