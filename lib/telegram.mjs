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

export function formatDraftMessage(lead, idShort) {
  const meta = lead._meta || {};
  const channel = meta.channel || 'email';
  const lines = [
    `AXON draft - ${idShort}`,
    `Company: ${lead.handle}`,
    `Industry: ${lead.niche || '-'}`,
    `Segment: ${lead.target_group} | Score: ${meta.score ?? '-'}`,
    `Service: ${meta.recommended_service || '-'}`,
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
  lines.push('Commands:');
  lines.push(`/approve ${idShort}`);
  lines.push(`/reject ${idShort}`);
  lines.push(`/sent_li ${idShort}`);
  lines.push('/status');

  return lines.join('\n').slice(0, 4000);
}

export function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null;
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@\w+$/, '');
  const arg = parts[1]?.toLowerCase();
  return { cmd, arg };
}
