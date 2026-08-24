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

/**
 * Allowed NI-account emails, from AXON_ACCOUNT_EMAILS (comma-separated).
 * Kept in env, never in git — this repo is public. Empty list = no email gate
 * (any non-empty email is accepted alongside a valid code), so a deploy that
 * only sets the code still works.
 */
export function getAllowedEmails(): string[] {
  return (process.env.AXON_ACCOUNT_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type LoginResult = { ok: true } | { ok: false; reason: 'code' | 'email' };

/** One NI account = one email + one AXON code. Both must match to sign in. */
export function validateLogin(email: string, password: string): LoginResult {
  if (!validatePassword(password)) return { ok: false, reason: 'code' };
  const allowed = getAllowedEmails();
  if (allowed.length > 0 && !allowed.includes((email || '').trim().toLowerCase())) {
    return { ok: false, reason: 'email' };
  }
  return { ok: true };
}
