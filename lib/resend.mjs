export async function resendSend(cfg, { to, subject, html }) {
  if (cfg.dryRun) {
    console.log(`[DRY RUN] Resend from ${cfg.resendFrom} (reply ${cfg.resendReplyTo}) → ${to}: ${subject}`);
    return { id: 'dry-run' };
  }
  const payload = {
    from: cfg.resendFrom,
    to: [to],
    subject,
    html: html.replace(/\n/g, '<br>'),
  };
  if (cfg.resendReplyTo) payload.reply_to = cfg.resendReplyTo;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
