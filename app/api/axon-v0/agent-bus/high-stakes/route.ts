import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { listHighStakesAgentBus } from '@/lib/axon-agent-bus-high-stakes.mjs';

// AX-SMALL-BUILDS-BUNDLE-0904 item (2): high-stakes agent_bus threads for the
// operator surface — the few open threads that need JB's eyes each cycle,
// filtered via the DB view once scripts/axon_agent_bus_high_stakes_bc.sql is
// applied, or a client-side heuristic fallback until then (see
// lib/axon-agent-bus-high-stakes.mjs). Always 200s with a (possibly empty)
// array so a single bad source never breaks the poll, same convention as
// app/api/axon-v0/comms-feed/route.ts.
export const dynamic = 'force-dynamic';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<unknown[]> };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const { rows, source } = await listHighStakesAgentBus(sb(), {
      limit: Number.isFinite(limit) && limit ? limit : undefined,
    });
    return NextResponse.json({ ok: true, rows, source });
  } catch {
    return NextResponse.json({ ok: true, rows: [], source: 'error' });
  }
}
