import { NextRequest, NextResponse } from 'next/server';
import { triggerHermesDispatch } from '@/lib/axon/agent-dispatch';
import { requireAxonOperatorId } from '@/lib/axon/operator';
import { assertFireAllowed, FireHoldError } from '@/lib/axon/axon-fire-gate';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAxonOperatorId();
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : undefined;
    await assertFireAllowed('dispatch.fire');
    await triggerHermesDispatch(code);
    return NextResponse.json({
      ok: true,
      message: code ? `Fired dispatch for ${code}` : 'Dispatch batch started — check Telegram',
    });
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { ok: false, error: err.message, hold: true, action: err.action },
        { status: 423 },
      );
    }
    const message = err instanceof Error ? err.message : 'dispatch fire failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
