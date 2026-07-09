import { NextRequest, NextResponse } from 'next/server';
import { fetchCompletedDispatches, fetchDispatchQueue } from '@/lib/agent-dispatch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const view = req.nextUrl.searchParams.get('view') ?? 'active';
    const rows =
      view === 'completed' ? await fetchCompletedDispatches() : await fetchDispatchQueue();
    return NextResponse.json({ ok: true, view, count: rows.length, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
