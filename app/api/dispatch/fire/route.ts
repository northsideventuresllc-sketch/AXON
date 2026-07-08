import { NextRequest, NextResponse } from 'next/server';
import { triggerHermesDispatch } from '@/lib/agent-dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : undefined;
    await triggerHermesDispatch(code);
    return NextResponse.json({
      ok: true,
      message: code ? `Fired dispatch for ${code}` : 'Dispatch batch started — check Telegram',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dispatch fire failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
