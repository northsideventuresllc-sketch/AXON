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
