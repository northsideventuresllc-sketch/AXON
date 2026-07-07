import { NextResponse } from 'next/server';
import { ensureMasterAccount } from '@/lib/axon-security';
import { createPasskeyLoginOptions } from '@/lib/axon-passkey';

export async function POST() {
  try {
    await ensureMasterAccount();
    const options = await createPasskeyLoginOptions();
    return NextResponse.json(options);
  } catch (err) {
    console.error('passkey/login/options', err);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}
