import { NextResponse } from 'next/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { ensureMasterAccount } from '@/lib/axon-security';
import { verifyPasskeyRegistration } from '@/lib/axon-passkey';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as RegistrationResponseJSON;
    const result = await verifyPasskeyRegistration(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('passkey/register/verify', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
