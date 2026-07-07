import { NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { ensureMasterAccount, createRecoveryToken } from '@/lib/axon-security';
import { sendRecoveryEmail } from '@/lib/axon-security-email';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();

    const { turnstileToken } = await req.json();
    const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const turnstile = await verifyTurnstileToken(turnstileToken || '', remoteIp);
    if (!turnstile.success && process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json({ error: 'Turnstile verification failed' }, { status: 403 });
    }

    const { token } = await createRecoveryToken();
    const emailResult = await sendRecoveryEmail(token);

    if (!emailResult.ok) {
      return NextResponse.json({ error: emailResult.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('security-questions/request-email', err);
    return NextResponse.json({ error: 'Failed to send recovery email' }, { status: 500 });
  }
}
