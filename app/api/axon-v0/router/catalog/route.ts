import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

async function sbGet(path: string) {
  const key = supabaseKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!r.ok) return [] as any[];
  return (await r.json()) as any[];
}

/**
 * The connector catalog: every provider the operator can connect, grouped by vendor, with
 * BOTH its subscription card and its API card shown separately — because both can be
 * connected at the same time and each becomes its own orderable lane.
 *
 * A subscription lane needs the vendor's own CLI signed in on a machine the operator
 * controls; there is no HTTP API for a consumer subscription. Where this account has no
 * such machine, the card comes back `available: false` with the reason, so the UI can grey
 * it out honestly instead of offering a button that cannot work.
 */
export async function GET() {
  try {
    const account = await getAccount();
    const [routes, models, connectors] = await Promise.all([
      sbGet('router_routes?select=*&order=connector_kind.asc,name.asc'),
      sbGet('router_models?select=*'),
      account ? sbGet(`axon_account_connectors?select=*&account_id=eq.${account.id}`) : Promise.resolve([]),
    ]);

    const connByRoute = new Map(connectors.map((c) => [c.route_id, c]));
    const hasMini = !!account?.has_mini_access;

    const cards = routes
      .filter((r) => !r.account_id || r.account_id === account?.id)
      .map((r) => {
        const conn = connByRoute.get(r.id);
        const needsMini = !!r.requires_mini && !hasMini;
        return {
          routeId: r.id,
          name: r.name,
          vendor: r.name.split('-')[0],
          connectorKind: r.connector_kind || r.kind,
          cliCommand: r.cli_command,
          authScope: r.auth_scope,
          status: conn?.status || 'disconnected',
          sortOrder: conn?.sort_order ?? 999,
          enabled: conn?.enabled ?? false,
          secretKeyName: r.secret_key,
          models: models.filter((m) => m.route_id === r.id).map((m) => ({
            laneId: m.id,
            model: m.model,
            costTier: m.cost_tier,
            capabilities: m.capabilities,
            isSafetyNet: m.is_safety_net,
          })),
          available: !needsMini,
          unavailableReason: needsMini
            ? 'Runs through this provider’s own command-line app, which needs a machine signed into the subscription. Add an API key for this provider instead.'
            : null,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return NextResponse.json({ hasMini, connectors: cards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load the connector catalog' },
      { status: 500 },
    );
  }
}
