import { NextResponse } from 'next/server';
import { ensureMasterAccount } from '@/lib/axon-security';
import { createPasskeyRegistrationOptions } from '@/lib/axon-passkey';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function POST() {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const options = await createPasskeyRegistrationOptions();
    return NextResponse.json(options);
  } catch (err) {
    console.error('passkey/register/options', err);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}
