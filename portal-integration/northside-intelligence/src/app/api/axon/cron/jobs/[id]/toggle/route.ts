import { NextRequest, NextResponse } from 'next/server';
import { toggleCronJob } from '@/lib/axon/axon-cron-service';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    await requireAxonOperatorId();
    const body = await req.json().catch(() => ({}));
    const enabled = typeof body?.enabled === 'boolean' ? body.enabled : Boolean(body?.enabled);
    const job = await toggleCronJob(params.id, enabled);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'toggle failed';
    const status = message === 'AXON access denied' ? 401 : message.includes('Unknown') ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
