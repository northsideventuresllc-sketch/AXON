import { NextRequest, NextResponse } from 'next/server';
import { fetchCompletedDispatches, fetchDispatchQueue } from '@/lib/axon/agent-dispatch';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAxonOperatorId();
    const view = req.nextUrl.searchParams.get('view') ?? 'active';
    const rows =
      view === 'completed' ? await fetchCompletedDispatches() : await fetchDispatchQueue();
    return NextResponse.json({ ok: true, view, count: rows.length, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue fetch failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
