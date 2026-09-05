const TELEGRAM_API = 'https://api.telegram.org/bot';

export const EXPECTED_BOT_USERNAME = 'northsideaxonbot';

export async function telegramGetMe(token) {
  const r = await fetch(`${TELEGRAM_API}${token}/getMe`);
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getMe: ${data.description || r.status}`);
  return data.result;
}

export async function telegramSend(token, chatId, text, dryRun = false, options = {}) {
  // IDENTITY FIX (2026-08-27, JB direct order): JB could not tell which agent
  // sent a given Telegram message, because every agent shares this one bot.
  // This is AXON's own outreach/content-machine send path — tag it precisely,
  // not just "[AXON]", so it reads distinctly from ARCEUS/EXEC/PULSE/SENSEI
  // alerts that go out through the separate mini-job-queue send path (those
  // are being tagged with their own agent name at the source, not here).
  const alreadyTagged = /^\[[^\]]+\]/.test(text);
  const prefixed = alreadyTagged ? text : `[AXON — Outreach] ${text}`;
  const { threadId } = options || {};
  if (dryRun) {
    console.log(`[DRY RUN] Telegram -> ${chatId}: ${prefixed.slice(0, 120)}...`);
    return { ok: true };
  }
  const body = {
    chat_id: chatId,
    text: prefixed,
    disable_web_page_preview: true,
  };
  // Optional: post into a specific forum topic thread. Omitted entirely when
  // no threadId is passed, so behaviour is unchanged for every existing caller.
  if (threadId != null) body.message_thread_id = threadId;
  const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram send: ${data.description || r.status}`);
  return data;
}

export async function telegramSendWithKeyboard(token, chatId, text, replyMarkup, dryRun = false, options = {}) {
  const { threadId } = options || {};
  if (dryRun) {
    console.log(`[DRY RUN] Telegram (keyboard) -> ${chatId}: ${text.slice(0, 120)}...`);
    return { ok: true };
  }
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  };
  if (threadId != null) body.message_thread_id = threadId;
  const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram send (keyboard): ${data.description || r.status}`);
  return data;
}

export async function telegramAnswerCallbackQuery(token, callbackQueryId, text = '') {
  const body = { callback_query_id: callbackQueryId };
  if (text) body.text = text.slice(0, 200);
  const r = await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  // A tap Telegram is replaying after a retry loop (or one the user made
  // more than ~30s ago) can no longer be answered. That is not a failure of
  // OUR handling: the work is already recorded upstream. Throwing here turned
  // the webhook into a 500, which made Telegram retry the same stale update
  // forever and block every newer tap behind it (JB live, 2026-09-05).
  if (!data.ok && /query is too old|query ID is invalid/i.test(String(data.description || ''))) {
    return { ok: false, stale: true, description: data.description };
  }
  if (!data.ok) throw new Error(`Telegram answerCallbackQuery: ${data.description || r.status}`);
  return data;
}

/** Removes (or replaces) the inline keyboard on an already-sent message — used
 * after a callback tap is handled so a second tap on the same message is
 * impossible. Pass replyMarkup to replace instead of clear. */
export async function telegramEditMessageReplyMarkup(token, chatId, messageId, replyMarkup = { inline_keyboard: [] }) {
  const r = await fetch(`${TELEGRAM_API}${token}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram editMessageReplyMarkup: ${data.description || r.status}`);
  return data;
}

export async function telegramGetUpdates(token, offset) {
  const params = new URLSearchParams({ timeout: '0', limit: '20' });
  if (offset != null) params.set('offset', String(offset));
  const r = await fetch(`${TELEGRAM_API}${token}/getUpdates?${params}`);
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getUpdates: ${data.description || r.status}`);
  return data.result || [];
}

export async function telegramSetCommands(token, commands) {
  const r = await fetch(`${TELEGRAM_API}${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram setMyCommands: ${data.description || r.status}`);
  return data;
}

export async function telegramSetWebhook(token, url, secretToken = null) {
  const body = { url, allowed_updates: ['message', 'callback_query'] };
  if (secretToken) body.secret_token = secretToken;
  const r = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram setWebhook: ${data.description || r.status}`);
  return data;
}

export async function telegramDeleteWebhook(token) {
  const r = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram deleteWebhook: ${data.description || r.status}`);
  return data;
}

export async function telegramGetWebhookInfo(token) {
  const r = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getWebhookInfo: ${data.description || r.status}`);
  return data.result;
}

export function formatDraftMessage(lead, idShort) {
  const meta = lead._meta || {};
  const channel = meta.channel || 'email';
  const lines = [
    `New draft ready — ${idShort}`,
    `Company: ${lead.handle}`,
    `Industry: ${lead.niche || '-'}`,
    `Segment: ${lead.target_group} | Fit score: ${meta.score ?? '-'}`,
    `Recommended service: ${meta.recommended_service || '-'}`,
    `Channel: ${channel}`,
    '',
    lead.why_match_fit || '',
    '',
  ];

  if (channel === 'email' && lead.comment_draft) {
    lines.push(`Subject: ${meta.email_subject || '(no subject)'}`);
    lines.push('');
    lines.push(lead.comment_draft);
  } else if (lead.dm_draft) {
    lines.push('LinkedIn DM:');
    lines.push(lead.dm_draft);
  }

  lines.push('');
  lines.push('When you are ready:');
  lines.push(`/approve ${idShort} — send it`);
  lines.push(`/reject ${idShort} — pass on this one`);
  lines.push(`/sent_li ${idShort} — you sent the LinkedIn DM yourself`);
  lines.push('/status — see the full pipeline');

  return lines.join('\n').slice(0, 4000);
}

export function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null;
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@\w+$/, '');
  const arg = parts[1]?.toLowerCase();
  const rest = parts.length > 2 ? parts.slice(2).join(' ') : '';
  return { cmd, arg, rest };
}
