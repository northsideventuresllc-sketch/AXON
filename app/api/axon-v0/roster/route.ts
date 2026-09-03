import { NextResponse } from 'next/server';
import { listAgentRoutines } from '@/lib/axon-v0/agent-routines';

/**
 * Fleet tab data for the AGENTS board — every `nvg_agent_routines` row (retired or not;
 * the panel shows Archived rows with the Fire button disabled rather than hiding them).
 * listAgentRoutines() never selects fire_token, so it never reaches the browser here.
 * Always 200s with an array so a single bad source never breaks the Fleet panel's poll.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await listAgentRoutines();
    return NextResponse.json({ ok: true, rows });
  } catch {
    return NextResponse.json({ ok: true, rows: [] });
  }
}
