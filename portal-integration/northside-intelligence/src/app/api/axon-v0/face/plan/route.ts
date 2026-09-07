import { NextResponse } from 'next/server';
import { loadDayPlan } from '@/lib/axon/face-plan-reads';
import { requireAxonOperatorId } from '@/lib/axon/operator';

/**
 * THE FACE — portal mount (FACE-PORTAL-MOUNT-0906). See
 * src/app/api/axon-v0/face/summary/route.ts for the guard pattern this follows.
 * Read-only, same 200-always contract as AXON's own route.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAxonOperatorId();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AXON access denied';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, plan: await loadDayPlan() });
  } catch {
    return NextResponse.json({
      ok: true,
      plan: { source: 'none', date: null, items: [], readable: false },
    });
  }
}
