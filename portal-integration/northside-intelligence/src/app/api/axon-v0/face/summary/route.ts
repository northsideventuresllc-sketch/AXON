import { NextResponse } from 'next/server';
import { loadFaceSummary } from '@/lib/axon/face-reads';
import { shapeFaceSummary } from '@/lib/axon/face-summary.mjs';
import { requireAxonOperatorId } from '@/lib/axon/operator';

/**
 * THE FACE — portal mount (FACE-PORTAL-MOUNT-0906). Same 200-always contract as AXON's
 * own app/api/axon-v0/face/summary/route.ts: awaits requireAxonOperatorId() first (the
 * portal's per-route guard every other /api/axon/* route here uses — see
 * src/app/api/axon/workspace/route.ts) so an unauthenticated or non-operator request
 * never reaches loadFaceSummary(), then always resolves 200 with a complete shape.
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
    return NextResponse.json({ ok: true, summary: await loadFaceSummary() });
  } catch {
    return NextResponse.json({ ok: true, summary: shapeFaceSummary() });
  }
}
