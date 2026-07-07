import { NextResponse } from 'next/server';
import { ensureMasterAccount, verifySecurityQuestions } from '@/lib/axon-security';
import { getSessionFromCookies, setSessionCookie } from '@/lib/axon-session';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { answers } = await req.json();
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers array required' }, { status: 400 });
    }

    const result = await verifySecurityQuestions(answers);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    await setSessionCookie({ ...session, securityVerified: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('security-questions/verify', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
