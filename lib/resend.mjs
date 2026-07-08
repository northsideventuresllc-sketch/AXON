/**
 * @param {object} cfg
 * @param {{ to: string, subject: string, html: string, from?: string, replyTo?: string }} opts
 */
export async function resendSend(cfg, { to, subject, html, from, replyTo }) {
  if (cfg.dryRun) {
    console.log(`[DRY RUN] Resend → ${to}: ${subject}`);
    return { id: 'dry-run' };
  }
  const body = {
    from: from || cfg.resendFrom,
    to: [to],
    subject,
    html: html.replace(/\n/g, '<br>'),
  };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
