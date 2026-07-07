import { NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import { ensureMasterAccount, getUserSecurity, updateAuthRecord } from '@/lib/axon-security';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function POST() {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserSecurity();
    const secret = user.two_fa_secret || generateSecret();
    if (!user.two_fa_secret) {
      await updateAuthRecord('default', { totpSecret: secret });
    }

    const issuer = 'NORTHSiDE AXON';
    const otpauthUrl = generateURI({ issuer, label: user.display_name, secret });

    return NextResponse.json({
      secret,
      otpauthUrl,
      qrData: otpauthUrl,
    });
  } catch (err) {
    console.error('2fa/setup', err);
    return NextResponse.json({ error: '2FA setup failed' }, { status: 500 });
  }
}
