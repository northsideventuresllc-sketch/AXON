import { NextResponse } from 'next/server';
import { listUsageRunway } from '@/lib/axon-v0/usage-runway';

/**
 * Usage runway strip data. See lib/axon-v0/usage-runway.ts for the view + graceful-empty
 * contract — if lane B1's v_usage_runway view doesn't exist yet, this still 200s with
 * { rows: [] } so the strip renders its "No usage data yet" state instead of erroring.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await listUsageRunway();
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
