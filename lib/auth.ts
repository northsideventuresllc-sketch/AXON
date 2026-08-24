import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'axon_session';

export function getDashboardSecret() {
  return process.env.AXON_DASHBOARD_SECRET || process.env.SUPABASE_SERVICE_KEY?.slice(0, 32);
}

export async function isAuthenticated(): Promise<boolean> {
  const secret = getDashboardSecret();
  if (!secret) return false;
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === secret;
}

export function validatePassword(password: string): boolean {
  const secret = getDashboardSecret();
  if (!secret) return false;
  return password === secret;
}

/** Parse a comma/space/newline-separated email list into lowercased entries. */
function parseEmails(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Allowed NI-account emails from env AXON_ACCOUNT_EMAILS (kept out of git). */
export function getAllowedEmails(): string[] {
  return parseEmails(process.env.AXON_ACCOUNT_EMAILS);
}

/**
 * Read one secret from NI-Brain (ni_platform_secrets) with the server service
 * key. Dynamic import so the edge middleware bundle never pulls supabase in.
 * Returns null on any failure — callers fall back to env, never lock out.
 */
async function readBrainSecret(key: string): Promise<string | null> {
  const svc = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return null;
  try {
    const { createSupabaseClient } = await import('./supabase.mjs');
    const { sbSelect } = createSupabaseClient(svc) as {
      sbSelect: (t: string, f?: string) => Promise<Array<{ value?: string }>>;
    };
    const rows = await sbSelect(
      'ni_platform_secrets',
      `select=value&key=eq.${encodeURIComponent(key)}`
    );
    return rows?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

export type LoginResult = { ok: true } | { ok: false; reason: 'code' | 'email' };

/**
 * One NI account = one email + one AXON code. The code and allowed emails are
 * read live from NI-Brain (ni_platform_secrets keys AXON_DASHBOARD_SECRET and
 * AXON_ACCOUNT_EMAILS) so JB can set/rotate them without a redeploy. The env
 * vars are also accepted as a fallback, so a missing/unreachable brain never
 * locks anyone out. Empty email list on both sides = no email gate.
 */
export async function validateLogin(email: string, password: string): Promise<LoginResult> {
  const typed = (password || '').trim();
  if (!typed) return { ok: false, reason: 'code' };

  const envSecret = getDashboardSecret();
  const brainCode = await readBrainSecret('AXON_DASHBOARD_SECRET');
  const codeOk = (brainCode && typed === brainCode) || (envSecret && typed === envSecret);
  if (!codeOk) return { ok: false, reason: 'code' };

  const allowed = new Set([
    ...getAllowedEmails(),
    ...parseEmails(await readBrainSecret('AXON_ACCOUNT_EMAILS')),
  ]);
  if (allowed.size > 0 && !allowed.has((email || '').trim().toLowerCase())) {
    return { ok: false, reason: 'email' };
  }
  return { ok: true };
}
