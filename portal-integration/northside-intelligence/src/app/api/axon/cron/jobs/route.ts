import { NextResponse } from 'next/server';
import { listCronJobs } from '@/lib/axon/axon-cron-service';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAxonOperatorId();
    const jobs = await listCronJobs();
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cron list failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
