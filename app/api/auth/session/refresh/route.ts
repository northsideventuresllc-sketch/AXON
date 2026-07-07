import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, refreshSession, verifySessionToken } from '@/lib/axon-session';
import { getCookiePath } from '@/lib/paths';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const refreshedToken = refreshSession(token);
    if (!refreshedToken) {
      return NextResponse.json({ error: 'Session expired due to inactivity' }, { status: 401 });
    }

    cookieStore.set(SESSION_COOKIE, refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: getCookiePath(),
      maxAge: 60 * 60 * 24 * 7,
    });

    const updated = verifySessionToken(refreshedToken);
    return NextResponse.json({
      ok: true,
      lastActivity: updated?.lastActivity,
    });
  } catch (err) {
    console.error('session/refresh', err);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
