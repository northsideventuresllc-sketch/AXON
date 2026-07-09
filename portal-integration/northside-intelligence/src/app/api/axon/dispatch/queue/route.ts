import { NextRequest, NextResponse } from 'next/server';
import { fetchCompletedDispatches, fetchDispatchQueue } from '@/lib/axon/agent-dispatch';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAxonOperatorId();
    const view = req.nextUrl.searchParams.get('view') ?? 'active';
    const since = req.nextUrl.searchParams.get('since') ?? '2025-06-29';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '500'), 1000);
    const rows =
      view === 'completed'
        ? await fetchCompletedDispatches(limit, since)
        : await fetchDispatchQueue();
    return NextResponse.json({
      ok: true,
      view,
      since: view === 'completed' ? since : undefined,
      count: rows.length,
      items: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue fetch failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
