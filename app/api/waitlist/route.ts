import { NextResponse } from 'next/server';
import { addWaitlistEmail } from '@/lib/leads';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    await addWaitlistEmail(email.toLowerCase().trim());
    return NextResponse.json({ ok: true, message: 'You are on the AXON waitlist.' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Signup failed' },
      { status: 500 }
    );
  }
}
