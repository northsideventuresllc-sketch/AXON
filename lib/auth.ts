import { getSessionFromCookies, isSessionActive } from '@/lib/axon-session';

export { SESSION_COOKIE } from '@/lib/axon-session';

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSessionFromCookies();
  return session !== null && isSessionActive(session);
}

/** @deprecated Use passcode flow via /api/auth/passcode/verify */
export function getDashboardSecret() {
  return process.env.AXON_DASHBOARD_SECRET || process.env.SUPABASE_SERVICE_KEY?.slice(0, 32);
}

/** @deprecated Use passcode flow via /api/auth/passcode/verify */
export function validatePassword(_password: string): boolean {
  return false;
}
