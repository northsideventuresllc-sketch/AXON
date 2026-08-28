import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function hdrs() {
  const key = supabaseKey();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/**
 * Persist the operator's drag order, and connect/disconnect a connector.
 *
 * Body: { order?: [routeId, ...], connect?: { routeId, connectorKind, status, secretKey? } }
 *
 * sort_order feeds the router's final tie-break, so this is the operator's direct hand on
 * lane preference when two lanes score identically.
 */
export async function PATCH(req: Request) {
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'No account' }, { status: 400 });
    const body = await req.json();

    if (Array.isArray(body.order)) {
      await Promise.all(
        body.order.map((routeId: string, i: number) =>
          fetch(
            `${SUPABASE_URL}/rest/v1/axon_account_connectors?account_id=eq.${account.id}&route_id=eq.${routeId}`,
            {
              method: 'PATCH',
              headers: hdrs(),
              body: JSON.stringify({ sort_order: i, updated_at: new Date().toISOString() }),
            },
          ),
        ),
      );
    }

    if (body.connect?.routeId) {
      const { routeId, connectorKind, status, secretKey } = body.connect;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/axon_account_connectors`, {
        method: 'POST',
        headers: { ...hdrs(), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          account_id: account.id,
          route_id: routeId,
          connector_kind: connectorKind,
          status: status || 'connected',
          // NAME of a key in ni_platform_secrets. The value never passes through here.
          secret_key: secretKey || null,
          enabled: status !== 'disconnected',
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'Could not save that connector' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Connector update failed' },
      { status: 500 },
    );
  }
}
