/**
 * Instruction-change requests — Telegram approve / deny / reply round trip.
 * Ticket: BPA-B4-TELEGRAM-ROUNDTRIP-0906.
 *
 * Flow this closes: close-outs -> ARCEUS -> council produces a request row ->
 * one message to JB with three buttons -> a tap (or a Reply + his next text
 * message) writes the decision back onto the row -> approval re-fires
 * requester_agent over agent_bus so the requester picks the decision up.
 *
 * REUSES, does not duplicate:
 *   - lib/telegram.mjs send/keyboard/answer/editMessageReplyMarkup helpers
 *   - lib/telegram-auth.mjs isAuthorizedChat for the chat allowlist
 *   - the JB-Approvals-topic check from lib/nvg-approve-telegram.mjs (same
 *     policy, mirrored here rather than imported since it is a few lines of
 *     cfg-driven logic, not an exported helper there either)
 *   - the agent_bus insert shape from lib/axon-agent-comms.mjs's
 *     handoffToAgent (from_agent/to_agent/subject/body/needs_answer/status)
 *
 * Table: nvg_instruction_change_requests — did NOT exist in NI-Brain as of
 * 2026-09-07 (checked live via information_schema.columns before writing this
 * file). The expected shape is staged, NOT applied, at
 * sql/2026-09-07__nvg_instruction_change_requests.sql. Every table access
 * below is wrapped so a missing table logs one clear line and degrades
 * gracefully instead of throwing — this module works today (against real
 * Telegram taps) even before that migration is ever run, it just can't
 * persist a decision until the table exists.
 */
import {
  telegramAnswerCallbackQuery,
  telegramEditMessageReplyMarkup,
  telegramSendWithKeyboard,
} from './telegram.mjs';
import { isAuthorizedChat } from './telegram-auth.mjs';

export const TABLE = 'nvg_instruction_change_requests';

// Telegram callback_data is capped at 64 bytes. "ic:" + a uuid (36) + ":" +
// the longest action word "approve" (7) = 47 bytes — comfortably under the
// limit, so the full words stay readable in logs rather than single letters.
const CALLBACK_RE = /^ic:([0-9a-fA-F-]{8,36}):(approve|deny|reply)$/;

function isTableMissingError(err) {
  return /HTTP 404|PGRST205|does not exist|schema cache/i.test(String(err?.message || err));
}

async function logTableMissing(op) {
  console.warn(
    `instruction-change-requests: ${TABLE} not found while trying to ${op} — ` +
      'staged migration at sql/2026-09-07__nvg_instruction_change_requests.sql has not been applied yet. Skipping write.'
  );
}

/**
 * Build the JB-facing Telegram message for one instruction-change request.
 * @param {{ id: string, requester_agent: string, target_agent: string, summary: string, diff_url?: string }} request
 */
export function formatInstructionChangeMessage(request) {
  const { id, requester_agent, target_agent, summary, diff_url } = request;
  const lines = [
    'Instruction change request',
    '',
    `From: ${requester_agent}`,
    `Changes behavior for: ${target_agent}`,
    '',
    summary || '(no summary provided)',
  ];
  if (diff_url) {
    lines.push('', `Diff: ${diff_url}`);
  }
  lines.push('', `id: ${id}`);
  return lines.join('\n').slice(0, 4000);
}

/** Approve / Deny / Reply — callback_data `ic:<id>:approve|deny|reply`. */
export function buildInstructionChangeKeyboard(request) {
  const id = request.id;
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `ic:${id}:approve` },
        { text: '❌ Deny', callback_data: `ic:${id}:deny` },
        { text: '💬 Reply', callback_data: `ic:${id}:reply` },
      ],
    ],
  };
}

/**
 * Send the request card to JB (his private chat, or the NVG Agents group's
 * JB Approvals topic when that's configured — mirrors sendBatchNotification
 * in content-machine-telegram.mjs).
 */
export async function sendInstructionChangeRequest(cfg, sb, request) {
  const { sbPatch } = sb;
  const text = formatInstructionChangeMessage(request);
  const keyboard = buildInstructionChangeKeyboard(request);

  if (cfg.dryRun) {
    console.log(`[DRY RUN] Instruction-change request notify:\n${text}`);
    return text;
  }

  const result = await telegramSendWithKeyboard(
    cfg.telegramToken,
    cfg.telegramChatId,
    text,
    keyboard,
    false,
    { threadId: cfg.telegramApprovalsThreadId ?? undefined }
  );

  const messageId = result?.result?.message_id;
  if (messageId != null) {
    try {
      await sbPatch(TABLE, `id=eq.${request.id}`, { telegram_message_id: messageId });
    } catch (err) {
      if (isTableMissingError(err)) await logTableMissing('stamp telegram_message_id');
      else throw err;
    }
  }

  return text;
}

/**
 * Checks whether the tapping chat/topic is authorized — same policy as
 * handleNvgApproveCallback in lib/nvg-approve-telegram.mjs: JB's private chat
 * is accepted as-is; a tap from the NVG Agents group must come from the JB
 * Approvals topic specifically, once that topic is provisioned.
 */
function isAuthorizedTap(cfg, chatId, threadId) {
  if (!isAuthorizedChat(cfg, chatId)) return { ok: false, reason: 'chat_id_mismatch' };

  const groupId = cfg.telegramGroupChatId || cfg.telegramChatId;
  const inGroup = cfg.telegramApprovalsThreadId && groupId && chatId === String(groupId)
    && !(cfg.telegramDmChatId && chatId === String(cfg.telegramDmChatId));
  if (inGroup && threadId !== String(cfg.telegramApprovalsThreadId)) {
    return { ok: false, reason: 'thread_id_mismatch' };
  }
  return { ok: true, reason: null };
}

/**
 * Re-fire the requester on approve — an open agent_bus row, never a direct
 * routine fire (per ticket). Shape matches handoffToAgent in
 * lib/axon-agent-comms.mjs.
 */
async function refireRequester(sbInsert, request) {
  try {
    const row = await sbInsert('agent_bus', {
      from_agent: 'instruction-change-council',
      to_agent: request.requester_agent,
      subject: `INSTRUCTION-CHANGE APPROVED ${request.id}`,
      body: `JB approved the instruction change for ${request.target_agent}. Summary: ${request.summary || '(none)'}${request.diff_url ? ` — ${request.diff_url}` : ''}`,
      needs_answer: false,
      status: 'open',
    });
    console.log(`instruction-change-requests: re-fired ${request.requester_agent} via agent_bus for ${request.id}`);
    return row;
  } catch (err) {
    console.warn(`instruction-change-requests: agent_bus re-fire failed for ${request.id}: ${err.message}`);
    return null;
  }
}

/**
 * Handles a callback_query whose data starts with "ic:". Called from
 * handleTelegramCallback in telegram-handler.mjs.
 * @param {{ telegramToken: string, telegramChatId: string|number }} cfg
 * @param {{ sbSelect: Function, sbInsert: Function, sbPatch: Function }} sb
 * @param {object} callbackQuery
 */
export async function handleInstructionChangeCallback(cfg, sb, callbackQuery) {
  const { sbInsert, sbPatch } = sb;
  const token = cfg.telegramToken;
  const queryId = callbackQuery.id;
  const chatId = String(callbackQuery.message?.chat?.id ?? '');
  const threadId = callbackQuery.message?.message_thread_id != null
    ? String(callbackQuery.message.message_thread_id)
    : null;
  const data = callbackQuery.data || '';
  const messageId = callbackQuery.message?.message_id;

  const auth = isAuthorizedTap(cfg, chatId, threadId);
  if (!auth.ok) {
    await telegramAnswerCallbackQuery(token, queryId, 'Not authorized.');
    return null;
  }

  const match = CALLBACK_RE.exec(data);
  if (!match) {
    await telegramAnswerCallbackQuery(token, queryId, 'Unrecognized action.');
    return null;
  }

  const [, id, action] = match;
  const nowIso = new Date().toISOString();

  if (action === 'approve') {
    let request = null;
    try {
      await sbPatch(TABLE, `id=eq.${id}`, { status: 'approved', decided_at: nowIso });
      const rows = await sb.sbSelect(TABLE, `id=eq.${id}&select=*&limit=1`);
      request = rows?.[0] ?? null;
    } catch (err) {
      if (isTableMissingError(err)) await logTableMissing('approve');
      else throw err;
    }

    if (request) {
      await refireRequester(sbInsert, request);
    } else {
      console.warn(`instruction-change-requests: approve on ${id} could not re-fire — request row unavailable`);
    }

    await telegramAnswerCallbackQuery(token, queryId, 'Approved.');
  } else if (action === 'deny') {
    try {
      await sbPatch(TABLE, `id=eq.${id}`, { status: 'denied', decided_at: nowIso });
    } catch (err) {
      if (isTableMissingError(err)) await logTableMissing('deny');
      else throw err;
    }
    await telegramAnswerCallbackQuery(token, queryId, 'Denied.');
  } else {
    // reply: prompt JB for a note, and mark this row as waiting for his next
    // text message in this chat/topic so tryCaptureInstructionChangeNote
    // (wired into handleTelegramMessage) can pick it up. Minimal state, kept
    // on the row itself — this repo has no persistent multi-step await-state
    // store (see lib/content-machine-telegram.mjs's /content_edit comment).
    try {
      await sbPatch(TABLE, `id=eq.${id}`, {
        awaiting_reply: true,
        awaiting_reply_chat_id: chatId,
        awaiting_reply_thread_id: threadId,
      });
    } catch (err) {
      if (isTableMissingError(err)) await logTableMissing('mark awaiting_reply');
      else throw err;
    }

    if (!cfg.dryRun) {
      await telegramSendWithKeyboard(
        token,
        chatId,
        `Reply to this message with your note for ${id}.`,
        { force_reply: true, selective: true },
        false,
        { threadId: threadId ?? undefined }
      );
    }

    await telegramAnswerCallbackQuery(token, queryId, 'Send your note as your next message.');
  }

  // Best-effort keyboard removal so a second tap on the same message can't
  // double-decide it — never allowed to undo the write above or the
  // answerCallbackQuery call.
  if (messageId != null) {
    try {
      await telegramEditMessageReplyMarkup(token, chatId, messageId);
    } catch (err) {
      console.warn(`instruction-change-requests: editMessageReplyMarkup failed: ${err.message}`);
    }
  }

  return true;
}

/**
 * Called from handleTelegramMessage for free-text (non-command) messages,
 * BEFORE the normal chat flow, so a Reply-flow note gets captured instead of
 * being treated as a chat message to AXON. Returns the updated request row
 * on capture, or null when nothing was awaiting a reply in this chat/topic
 * (including when the table itself doesn't exist yet).
 */
export async function tryCaptureInstructionChangeNote(sb, { chatId, threadId, text }) {
  const { sbSelect, sbPatch } = sb;
  let rows;
  try {
    rows = await sbSelect(
      TABLE,
      `awaiting_reply=eq.true&awaiting_reply_chat_id=eq.${encodeURIComponent(String(chatId))}&select=*&order=created_at.desc&limit=20`
    );
  } catch (err) {
    if (isTableMissingError(err)) {
      await logTableMissing('look up an awaiting reply');
      return null;
    }
    throw err;
  }

  const threadKey = threadId == null ? null : String(threadId);
  const match = (rows || []).find((r) => (r.awaiting_reply_thread_id ?? null) === threadKey);
  if (!match) return null;

  await sbPatch(TABLE, `id=eq.${match.id}`, {
    jb_note: text,
    awaiting_reply: false,
  });

  console.log(`instruction-change-requests: captured jb_note for ${match.id}`);
  return { ...match, jb_note: text, awaiting_reply: false };
}
