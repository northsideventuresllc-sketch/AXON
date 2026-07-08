import { NextResponse } from 'next/server';
import { fetchDispatchQueue } from '@/lib/axon/agent-dispatch';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAxonOperatorId();
    const rows = await fetchDispatchQueue();
    return NextResponse.json({ ok: true, count: rows.length, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue fetch failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
