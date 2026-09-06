import { NextResponse } from 'next/server';
import { loadFaceSummary } from '@/lib/axon-v0/face-reads';
import { shapeFaceSummary } from '@/lib/axon-v0/face-summary.mjs';

/**
 * THE FACE — one JSON object for the whole home screen (Build Plan B, step 2).
 *
 * Every stat card, the module list and the orb's working signal read from this single
 * route, so the screen makes one request every 15 seconds rather than five.
 *
 * Same contract as the other panels here: it always 200s. A source that failed comes back
 * as `null`, which the cards render as a designed "No data yet" — never a zero standing in
 * for a number nobody could read. If the whole read falls over, the shape is still complete
 * and every number is null, and the client falls back to the mock orb signal.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, summary: await loadFaceSummary() });
  } catch {
    return NextResponse.json({ ok: true, summary: shapeFaceSummary() });
  }
}
