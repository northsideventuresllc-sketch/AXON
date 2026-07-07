import { NextResponse } from 'next/server';
import { verify } from 'otplib';
import { ensureMasterAccount, getUserSecurity } from '@/lib/axon-security';
import { getSessionFromCookies, setSessionCookie } from '@/lib/axon-session';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = (await req.json()) as { code?: string };
    if (!code) {
      return NextResponse.json({ error: 'TOTP code required' }, { status: 400 });
    }

    const user = await getUserSecurity();
    if (!user.two_fa_enabled || !user.two_fa_secret) {
      return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
    }

    const valid = verify({ token: code, secret: user.two_fa_secret });
    if (!valid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    await setSessionCookie({ ...session, totpVerified: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('2fa/challenge', err);
    return NextResponse.json({ error: '2FA challenge failed' }, { status: 500 });
  }
}
