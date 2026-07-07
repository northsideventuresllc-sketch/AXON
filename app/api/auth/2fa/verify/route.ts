import { NextResponse } from 'next/server';
import { verify } from 'otplib';
import { ensureMasterAccount, getUserSecurity, updateAuthRecord } from '@/lib/axon-security';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, enable } = (await req.json()) as { code?: string; enable?: boolean };
    if (!code) {
      return NextResponse.json({ error: 'TOTP code required' }, { status: 400 });
    }

    const user = await getUserSecurity();
    if (!user.two_fa_secret) {
      return NextResponse.json({ error: 'Run 2FA setup first' }, { status: 400 });
    }

    const valid = verify({ token: code, secret: user.two_fa_secret });
    if (!valid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    const totpEnabled = enable !== false;
    await updateAuthRecord('default', { totpEnabled });

    return NextResponse.json({ ok: true, totpEnabled });
  } catch (err) {
    console.error('2fa/verify', err);
    return NextResponse.json({ error: '2FA verification failed' }, { status: 500 });
  }
}
