import { createHash, timingSafeEqual } from 'crypto';

export const MF_SESSION_COOKIE = 'mf_admin_session';
export const MF_COOKIE_MAX_AGE = 60 * 60 * 8;

function sessionSecret(): string {
  return (
    process.env.MF_ADMIN_SECRET ||
    process.env.AXON_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    'dev-fallback'
  );
}

/** Session token for access-code auth (no email in cookie). */
export function deriveMatchFitSessionToken(): string {
  return createHash('sha256').update(`mf:access:${sessionSecret()}`).digest('hex');
}

export function getMatchFitAccessCode(): string {
  return process.env.MF_ADMIN_ACCESS_CODE ?? '';
}

/** Legacy email/password — used only when access code env is unset. */
export function getMatchFitLegacyCredentials() {
  return {
    email: process.env.MF_ADMIN_EMAIL ?? '',
    password: process.env.MF_ADMIN_PASSWORD ?? '',
  };
}

export function safeEq(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, Buffer.alloc(ab.length));
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function isMatchFitSessionValid(storedCookie: string): boolean {
  const code = getMatchFitAccessCode();
  if (code) {
    return safeEq(storedCookie, deriveMatchFitSessionToken());
  }
  const { email } = getMatchFitLegacyCredentials();
  if (!email) return false;
  const legacy = createHash('sha256').update(`mf:${email}:${sessionSecret()}`).digest('hex');
  return safeEq(storedCookie, legacy);
}
