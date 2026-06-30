const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function telegramSend(token, chatId, text, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY RUN] Telegram -> ${chatId}: ${text.slice(0, 120)}...`);
    return { ok: true };
  }
  const r = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram send: ${data.description || r.status}`);
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
  const body = { url, allowed_updates: ['message'] };
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
  return { cmd, arg };
}
