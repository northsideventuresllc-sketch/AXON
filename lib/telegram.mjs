const TELEGRAM_API = 'https://api.telegram.org/bot';

export const EXPECTED_BOT_USERNAME = 'northsideaxonbot';

export async function telegramGetMe(token) {
  const r = await fetch(`${TELEGRAM_API}${token}/getMe`);
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getMe: ${data.description || r.status}`);
  return data.result;
}

export function cleanTelegramHumanText(text) {
  if (!text) return '';
  let out = String(text);
  // Strip raw markdown asterisks (e.g. ****words**** or **words** -> words)
  out = out.replace(/\*{2,}([^*]+)\*{2,}/g, '$1');
  out = out.replace(/\*{2,}/g, '');
  // Strip markdown headers like ### Title -> Title
  out = out.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  // Strip backticks `code` -> code
  out = out.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  // Strip markdown links [Text](url) -> Text (url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');
  // Clean multiple horizontal spaces but preserve linebreaks and bullet formatting
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function chunkTelegramText(text, maxChars = 3800) {
  if (!text || text.length <= maxChars) return [text || ''];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf('\n\n', maxChars);
    if (splitIdx < maxChars * 0.3) {
      splitIdx = remaining.lastIndexOf('\n', maxChars);
    }
    if (splitIdx < maxChars * 0.3) {
      splitIdx = remaining.lastIndexOf('. ', maxChars);
      if (splitIdx > 0) splitIdx += 1;
    }
    if (splitIdx < maxChars * 0.3) {
      splitIdx = remaining.lastIndexOf(' ', maxChars);
    }
    if (splitIdx <= 0) {
      splitIdx = maxChars;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  return chunks.filter(Boolean);
}

export async function telegramSend(token, chatId, text, dryRun = false, options = {}) {
  const { threadId, untagged = false } = options || {};
  const cleanedText = cleanTelegramHumanText(text);
  const alreadyTagged = /^\[[^\]]+\]/.test(cleanedText);
  const prefixed = (untagged || alreadyTagged) ? cleanedText : `[AXON — Outreach] ${cleanedText}`;
  if (dryRun) {
    console.log(`[DRY RUN] Telegram -> ${chatId}: ${prefixed.slice(0, 120)}...`);
    return { ok: true };
  }

  const chunks = chunkTelegramText(prefixed, 3800);
  let lastData = { ok: true };
  for (const chunk of chunks) {
    const body = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    };
    if (threadId != null) body.message_thread_id = threadId;
    const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(`Telegram send: ${data.description || r.status}`);
    lastData = data;
  }
  return lastData;
}

export async function telegramSendWithKeyboard(token, chatId, text, replyMarkup, dryRun = false, options = {}) {
  const { threadId } = options || {};
  const cleanedText = cleanTelegramHumanText(text);
  if (dryRun) {
    console.log(`[DRY RUN] Telegram (keyboard) -> ${chatId}: ${cleanedText.slice(0, 120)}...`);
    return { ok: true };
  }

  const chunks = chunkTelegramText(cleanedText, 3800);
  // If there are multiple chunks, send preceding chunks as normal text and final chunk with keyboard
  for (let i = 0; i < chunks.length - 1; i++) {
    await telegramSend(token, chatId, chunks[i], dryRun, { threadId, untagged: true });
  }

  const finalChunk = chunks[chunks.length - 1] || cleanedText;
  const body = {
    chat_id: chatId,
    text: finalChunk,
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

export async function telegramAnswerCallbackQuery(token, callbackQueryId, text = '', options = {}) {
  const body = { callback_query_id: callbackQueryId };
  if (text) body.text = text.slice(0, 200);
  // showAlert turns the easy-to-miss toast into a pop-up JB has to dismiss —
  // used when a tap did NOT go through, so a failure is never silent.
  if (options?.showAlert) body.show_alert = true;
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

/** Rewrites an already-sent message's text (HTML parse mode). Used to turn an
 * approval card into a permanent receipt after JB taps a button. Pass
 * replyMarkup to keep/replace buttons; omit it to drop them. Telegram's
 * "message is not modified" (same text re-sent, e.g. a double tap) is not a
 * failure — the card already shows what we wanted. */
export async function telegramEditMessageText(token, chatId, messageId, html, options = {}) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (options.replyMarkup) body.reply_markup = options.replyMarkup;
  const r = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok && /message is not modified/i.test(String(data.description || ''))) {
    return { ok: true, unchanged: true };
  }
  if (!data.ok) throw new Error(`Telegram editMessageText: ${data.description || r.status}`);
  return data;
}

/** Sends one HTML message (parse_mode HTML, no tag prefix, no markdown
 * cleaning — the caller escapes its own text). Optional reply-to and
 * inline keyboard. Returns Telegram's response (result.message_id). */
export async function telegramSendHtml(token, chatId, html, options = {}) {
  const { threadId, replyToMessageId, replyMarkup } = options || {};
  const body = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (threadId != null) body.message_thread_id = threadId;
  if (replyToMessageId != null) {
    body.reply_parameters = { message_id: replyToMessageId, allow_sending_without_reply: true };
  }
  if (replyMarkup) body.reply_markup = replyMarkup;
  const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram send (html): ${data.description || r.status}`);
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
