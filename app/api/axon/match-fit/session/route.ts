/**
 * Match Fit admin session — credential gate for the AXON admin portal.
 * Credentials live in env vars (MF_ADMIN_EMAIL / MF_ADMIN_PASSWORD); never in git.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'mf_admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

function getCredentials() {
  return {
    email: process.env.MF_ADMIN_EMAIL ?? '',
    password: process.env.MF_ADMIN_PASSWORD ?? '',
  };
}

/** Derive a deterministic session token from server-side secrets. */
function deriveToken(email: string): string {
  const secret =
    process.env.MF_ADMIN_SECRET ||
    process.env.AXON_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    'dev-fallback';
  return createHash('sha256').update(`mf:${email}:${secret}`).digest('hex');
}

function safeEq(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
      // still run a comparison to avoid timing leak
      timingSafeEqual(ab, Buffer.alloc(ab.length));
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** POST — verify credentials and set session cookie. */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  const { email: envEmail, password: envPassword } = getCredentials();

  if (!envEmail || !envPassword) {
    return NextResponse.json(
      { ok: false, error: 'Admin credentials not configured on server' },
      { status: 503 }
    );
  }

  const inputEmail = (body.email ?? '').trim().toLowerCase();
  const inputPassword = body.password ?? '';

  const emailMatch = safeEq(inputEmail, envEmail.trim().toLowerCase());
  const passMatch = safeEq(inputPassword, envPassword);

  if (!emailMatch || !passMatch) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const token = deriveToken(envEmail);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

/** GET — check if session cookie is valid. */
export async function GET() {
  const { email: envEmail } = getCredentials();
  if (!envEmail) {
    return NextResponse.json({ ok: true, authed: false, reason: 'not_configured' });
  }

  const cookieStore = await cookies();
  const stored = cookieStore.get(SESSION_COOKIE)?.value ?? '';
  const expected = deriveToken(envEmail);
  const authed = safeEq(stored, expected);

  return NextResponse.json({ ok: true, authed });
}

/** DELETE — clear session. */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
