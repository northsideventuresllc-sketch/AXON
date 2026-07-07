import { NextResponse } from 'next/server';
import { ensureMasterAccount, setupPasscode } from '@/lib/axon-security';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { passcode } = await req.json();
    if (!passcode) {
      return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
    }

    const result = await setupPasscode(passcode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('passcode/setup', err);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}
