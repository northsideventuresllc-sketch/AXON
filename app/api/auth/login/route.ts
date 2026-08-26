import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, getDashboardSecret, validateLogin } from '@/lib/auth';
import { getCookiePath } from '@/lib/paths';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const result = await validateLogin(email, password);
    if (!result.ok) {
      const error =
        result.reason === 'email'
          ? 'That email is not on the AXON account list.'
          : 'That AXON code does not match.';
      return NextResponse.json({ error }, { status: 401 });
    }

    const cookieStore = await cookies();
    // The session cookie is the code (validated above); email gates entry, not the session.
    cookieStore.set(SESSION_COOKIE, getDashboardSecret() as string, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: getCookiePath(),
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 400 });
  }
}
