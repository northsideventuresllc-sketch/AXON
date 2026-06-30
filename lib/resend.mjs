export async function resendSend(cfg, { to, subject, html }) {
  if (cfg.dryRun) {
    console.log(`[DRY RUN] Resend → ${to}: ${subject}`);
    return { id: 'dry-run' };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.resendFrom,
      to: [to],
      subject,
      html: html.replace(/\n/g, '<br>'),
    }),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
