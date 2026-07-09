/**
 * Match Fit admin session — access-code gate for the AXON admin portal.
 * Set MF_ADMIN_ACCESS_CODE in deployment secrets or ni_platform_secrets (never commit the value).
 */
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  MF_COOKIE_MAX_AGE,
  MF_SESSION_COOKIE,
  deriveMatchFitSessionToken,
  getMatchFitLegacyCredentials,
  resolveMatchFitAccessCode,
  safeEq,
} from '@/lib/match-fit-session';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

function legacyToken(email: string): string {
  const secret =
    process.env.MF_ADMIN_SECRET ||
    process.env.AXON_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    'dev-fallback';
  return createHash('sha256').update(`mf:${email}:${secret}`).digest('hex');
}

/** POST — verify access code (or legacy email/password) and set session cookie. */
export async function POST(req: NextRequest) {
  let body: { accessCode?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  const accessCode = await resolveMatchFitAccessCode();

  if (accessCode) {
    const input = (body.accessCode ?? '').trim();
    if (!safeEq(input, accessCode)) {
      return NextResponse.json({ ok: false, error: 'Invalid access code' }, { status: 401 });
    }
    const token = deriveMatchFitSessionToken();
    const cookieStore = await cookies();
    cookieStore.set(MF_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MF_COOKIE_MAX_AGE,
      path: '/',
    });
    return NextResponse.json({ ok: true });
  }

  const { email: envEmail, password: envPassword } = getMatchFitLegacyCredentials();
  if (!envEmail || !envPassword) {
    return NextResponse.json(
      { ok: false, error: 'Match Fit access not configured on server' },
      { status: 503 },
    );
  }

  const inputEmail = (body.email ?? '').trim().toLowerCase();
  const inputPassword = body.password ?? '';
  if (!safeEq(inputEmail, envEmail.trim().toLowerCase()) || !safeEq(inputPassword, envPassword)) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const token = legacyToken(envEmail);
  const cookieStore = await cookies();
  cookieStore.set(MF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MF_COOKIE_MAX_AGE,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}

/** GET — check if session cookie is valid. */
export async function GET() {
  const accessCode = await resolveMatchFitAccessCode();
  const { email: envEmail } = getMatchFitLegacyCredentials();
  if (!accessCode && !envEmail) {
    return NextResponse.json({ ok: true, authed: false, reason: 'not_configured' });
  }

  const cookieStore = await cookies();
  const stored = cookieStore.get(MF_SESSION_COOKIE)?.value ?? '';
  const expected = accessCode ? deriveMatchFitSessionToken() : legacyToken(envEmail);
  const authed = safeEq(stored, expected);

  return NextResponse.json({ ok: true, authed });
}

/** DELETE — clear session. */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(MF_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
