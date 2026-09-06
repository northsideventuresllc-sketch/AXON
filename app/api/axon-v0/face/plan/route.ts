import { NextResponse } from 'next/server';
import { loadDayPlan } from '@/lib/axon-v0/face-plan-reads';

/**
 * THE FACE — today's plan, in EXEC's own words (Build Plan B, step 3).
 *
 * Read-only. The voice panel calls this when you ask for today's plan; nothing here writes,
 * sends or fires. Behind the dashboard session gate like every other route in this app.
 *
 * Source: EXEC's own daily post on the agent bus, falling back to EXEC's session note for
 * the same date. See lib/axon-v0/face-plan-reads.ts. There is no third fallback and nothing
 * is ever generated — if EXEC has not posted, the panel says "No plan posted yet today".
 *
 * Same contract as the summary route: it always 200s with a complete shape, so a failed
 * read darkens one panel and nothing else on the screen moves.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, plan: await loadDayPlan() });
  } catch {
    return NextResponse.json({
      ok: true,
      plan: { source: 'none', date: null, items: [], readable: false },
    });
  }
}
