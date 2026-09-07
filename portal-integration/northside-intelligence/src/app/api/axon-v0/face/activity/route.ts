import { NextResponse } from 'next/server';
import { loadFaceActivity } from '@/lib/axon/face-activity-reads';
import { shapeFaceActivity } from '@/lib/axon/face-activity.mjs';
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
    return NextResponse.json({ ok: true, activity: await loadFaceActivity() });
  } catch {
    return NextResponse.json({ ok: true, activity: shapeFaceActivity() });
  }
}
