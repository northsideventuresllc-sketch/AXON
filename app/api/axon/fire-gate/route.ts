import { NextResponse } from 'next/server';
import { getFireMode, setFireMode, type FireMode } from '@/lib/axon-fire-gate';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getFireMode();
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fire-gate read failed';
    // Fail safe — report HOLD even if something went wrong.
    return NextResponse.json(
      { ok: false, mode: 'HOLD', source: 'default', error: message },
      { status: 200 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      confirm?: boolean;
    };
    const requested = String(body?.mode || '').toUpperCase();
    if (requested !== 'FIRE' && requested !== 'HOLD') {
      return NextResponse.json(
        { ok: false, error: 'mode must be "FIRE" or "HOLD"' },
        { status: 400 },
      );
    }
    // Flipping to FIRE is the one moment that arms everything — require explicit confirm.
    if (requested === 'FIRE' && body?.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Firing requires confirm: true' },
        { status: 400 },
      );
    }
    const state = await setFireMode(requested as FireMode);
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fire-gate write failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
