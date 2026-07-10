import { NextResponse } from 'next/server';
import { listCronJobs } from '@/lib/axon-cron-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await listCronJobs();
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cron list failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
