import { getBasePath } from './paths';
import { loadConfig } from './config.mjs';
import { resendSend } from './resend.mjs';
import { createSupabaseClient } from './supabase.mjs';

export const AXON_SECURITY_FROM = 'AXON Security <noreply@northsideintelligence.com>';

type Config = Awaited<ReturnType<typeof loadConfig>>;

async function getConfig(): Promise<Config> {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const sb = createSupabaseClient(key);
  return loadConfig(sb.sbSelect);
}

function securityBaseUrl(): string {
  return (
    process.env.AXON_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://northsideintelligence.com')
  ).replace(/\/$/, '');
}

function recoveryUrl(token: string): string {
  const basePath = getBasePath();
  return `${securityBaseUrl()}${basePath}/login?recovery=${encodeURIComponent(token)}`;
}

function securitySettingsUrl(): string {
  const basePath = getBasePath();
  return `${securityBaseUrl()}${basePath}/security`;
}

async function sendSecurityEmail(
  cfg: Config,
  to: string,
  subject: string,
  html: string
): Promise<{ id: string }> {
  return resendSend(
    { ...cfg, resendFrom: AXON_SECURITY_FROM },
    { to, subject, html }
  ) as Promise<{ id: string }>;
}

export async function sendSecurityQuestionsEmail(
  operatorId: string,
  email: string,
  recoveryToken: string
): Promise<{ id: string }> {
  const cfg = await getConfig();
  const link = recoveryUrl(recoveryToken);

  const html = `
<h2>NORTHSiDE AXON — Account Recovery</h2>
<p>Your AXON account (<strong>${operatorId}</strong>) requires security question verification.</p>
<p>Use the link below to answer your security questions and restore access. This link expires in 24 hours.</p>
<p><a href="${link}">Verify security questions</a></p>
<p>If you did not request this, contact NORTHSiDE support immediately.</p>
<p>— AXON Security</p>
`.trim();

  return sendSecurityEmail(cfg, email, 'AXON — Verify your security questions', html);
}

export async function send2FASetupEmail(
  operatorId: string,
  email: string,
  setupToken?: string
): Promise<{ id: string }> {
  const cfg = await getConfig();
  const settingsUrl = securitySettingsUrl();
  const tokenLine = setupToken ? `<p>Setup token: <code>${setupToken}</code></p>` : '';

  const html = `
<h2>NORTHSiDE AXON — Two-Factor Authentication</h2>
<p>Two-factor authentication has been enabled for operator <strong>${operatorId}</strong>.</p>
<p>Complete setup in your AXON security settings:</p>
<p><a href="${settingsUrl}">Open security settings</a></p>
${tokenLine}
<p>If you did not enable 2FA, secure your account immediately.</p>
<p>— AXON Security</p>
`.trim();

  return sendSecurityEmail(cfg, email, 'AXON — Two-factor authentication setup', html);
}

export async function sendAccountLockedEmail(
  operatorId: string,
  email: string
): Promise<{ id: string }> {
  const cfg = await getConfig();
  const settingsUrl = securitySettingsUrl();

  const html = `
<h2>NORTHSiDE AXON — Account Locked</h2>
<p>Your AXON account (<strong>${operatorId}</strong>) has been locked after multiple failed sign-in attempts.</p>
<p>To restore access, verify your security questions:</p>
<p><a href="${settingsUrl}">Answer security questions</a></p>
<p>If this was not you, contact NORTHSiDE support immediately.</p>
<p>— AXON Security</p>
`.trim();

  return sendSecurityEmail(cfg, email, 'AXON — Your account has been locked', html);
}

/** Legacy helper used by recovery API route. */
export async function sendRecoveryEmail(token: string): Promise<{ ok: boolean; error?: string }> {
  const email = process.env.AXON_RECOVERY_EMAIL || 'jb@northsideintelligence.com';
  try {
    await sendSecurityQuestionsEmail('default', email, token);
    return { ok: true };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Recovery link: ${recoveryUrl(token)}`);
      return { ok: true };
    }
    const message = err instanceof Error ? err.message : 'Email send failed';
    return { ok: false, error: message };
  }
}

export function buildRecoveryUrl(token: string): string {
  return recoveryUrl(token);
}
