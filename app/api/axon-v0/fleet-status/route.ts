import { NextResponse } from 'next/server';
import { listFleetStatus } from '@/lib/axon-v0/fleet-status';

// Live fleet status strip data (v_fleet_live_status). Server-side only — the
// service key never reaches the browser. Always 200s with an array so a single
// bad source never breaks the strip's poll loop.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await listFleetStatus();
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
