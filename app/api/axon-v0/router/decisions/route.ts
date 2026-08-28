import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

/**
 * "What AXON is doing, and why" — the routing decision record.
 *
 * Every routeChat call writes one row: the capability class it inferred, the full ranked
 * candidate list with scores and human-readable reasons, which lane won, and anything it
 * fell through on the way. Auto mode is only trustworthy if it can be inspected.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const limit = Math.min(Number(searchParams.get('limit')) || 1, 25);
    const account = await getAccount();

    const key = supabaseKey();
    const filters = [
      account ? `account_id=eq.${account.id}` : null,
      agentId ? `agent_id=eq.${agentId}` : null,
    ].filter(Boolean);
    const qs = `select=*&order=created_at.desc&limit=${limit}${filters.length ? `&${filters.join('&')}` : ''}`;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/axon_router_decisions?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) return NextResponse.json({ decisions: [] });

    return NextResponse.json({ decisions: await r.json() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load routing decisions' },
      { status: 500 },
    );
  }
}
