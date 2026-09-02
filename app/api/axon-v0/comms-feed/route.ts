import { NextRequest, NextResponse } from 'next/server';
import { listAgentComms } from '@/lib/axon-v0/agent-comms';

// Merged agent-comms timeline (bus/slack/telegram/task) for the live Comms feed
// panel. Server-side only — the service key never reaches the browser; the
// client polls this route instead of subscribing to Realtime directly. Always
// 200s with an (possibly empty) array so a single bad source never breaks the poll.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent = searchParams.get('agent') || undefined;
  const since = searchParams.get('since') || undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const items = await listAgentComms({
      agent,
      since,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
