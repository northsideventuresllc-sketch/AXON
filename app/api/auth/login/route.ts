import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decideLoginResponse, validateLogin } from '@/lib/auth';
import { tryGetDashboardSecret } from '@/lib/axon-secrets.mjs';
import { getCookiePath } from '@/lib/paths';

export async function POST(req: Request) {
  try {
    // AX-DASHBOARD-SECRET-OWN-0906 follow-up (council PR #177 review): the effective
    // session-cookie secret has exactly ONE source — the env value, via the accessor.
    // validateLogin() below still accepts a live NI-Brain-sourced code as a valid login
    // *credential* (so JB can rotate the code without a redeploy), but that brain value
    // must never become the cookie itself. If the env secret is unset, skip validateLogin
    // entirely (no point spending a NI-Brain round trip on a login that can never produce
    // a valid cookie) — decideLoginResponse refuses with a plain-English 503 and no cookie,
    // instead of a login "succeeding" into a null/broken session that middleware.ts would
    // then 503 the entire dashboard on.
    const envSecret = tryGetDashboardSecret();
    const { email, password } = await req.json();
    const result = envSecret ? await validateLogin(email, password) : { ok: false as const, reason: 'code' as const };
    const decision = decideLoginResponse(envSecret, result);

    if (decision.setCookie) {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, decision.cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: getCookiePath(),
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return NextResponse.json(decision.body, { status: decision.status });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 400 });
  }
}
