import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';

export const dynamic = 'force-dynamic';

// ─── Types (mirror docs/axon-router-spec.md §3) ────────────────────────────

type RouteRow = {
  id: string;
  name: string;
  kind: string;
  secret_key: string | null;
  base_url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ModelRow = {
  id: string;
  route_id: string;
  model: string;
  tier_rank: number;
  priority: number;
  enabled: boolean;
};

type HealthRow = {
  id: string;
  route_id: string;
  model: string; // '' = route-wide
  status: 'healthy' | 'rate_limited' | 'dead';
  reason: string | null;
  failure_count: number;
  backoff_seconds: number;
  retry_after: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  updated_at: string;
};

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as {
    sbSelect: (t: string, f?: string) => Promise<any[]>;
    sbPatch: (t: string, f: string, r: unknown) => Promise<any>;
  };
}

// ─── GET — all routes, joined to their models and current health ──────────

export async function GET() {
  try {
    const client = sb();
    const [routes, models, health] = await Promise.all([
      client.sbSelect('router_routes', 'order=name.asc') as Promise<RouteRow[]>,
      client.sbSelect('router_models', 'order=tier_rank.desc,priority.asc') as Promise<ModelRow[]>,
      client.sbSelect('router_health', 'order=updated_at.desc') as Promise<HealthRow[]>,
    ]);

    const healthByKey = new Map<string, HealthRow>();
    for (const h of health) healthByKey.set(`${h.route_id}::${h.model}`, h);

    const modelsByRoute = new Map<string, ModelRow[]>();
    for (const m of models) {
      const list = modelsByRoute.get(m.route_id) ?? [];
      list.push(m);
      modelsByRoute.set(m.route_id, list);
    }

    const out = routes.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      secret_key: r.secret_key,
      base_url: r.base_url,
      enabled: r.enabled,
      // Route-wide health lives under model = '' — a dead key kills every model behind it.
      health: healthByKey.get(`${r.id}::`) ?? null,
      models: (modelsByRoute.get(r.id) ?? []).map((m) => ({
        id: m.id,
        model: m.model,
        tier_rank: m.tier_rank,
        priority: m.priority,
        enabled: m.enabled,
        health: healthByKey.get(`${r.id}::${m.model}`) ?? null,
      })),
    }));

    return NextResponse.json({ ok: true, routes: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'router list failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ─── POST — the four operator actions ──────────────────────────────────────
// { action: 'toggle_route',  routeId, enabled }
// { action: 'toggle_model',  modelId, enabled }
// { action: 'set_priority',  modelId, priority }
// { action: 'clear_health',  routeId, model }   // model '' clears the route-wide row

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const client = sb();

    switch (action) {
      case 'toggle_route': {
        const { routeId, enabled } = body as { routeId?: string; enabled?: boolean };
        if (!routeId || typeof enabled !== 'boolean') {
          return NextResponse.json({ ok: false, error: 'routeId and boolean enabled required' }, { status: 400 });
        }
        const row = await client.sbPatch('router_routes', `id=eq.${encodeURIComponent(routeId)}`, {
          enabled,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true, route: row });
      }

      case 'toggle_model': {
        const { modelId, enabled } = body as { modelId?: string; enabled?: boolean };
        if (!modelId || typeof enabled !== 'boolean') {
          return NextResponse.json({ ok: false, error: 'modelId and boolean enabled required' }, { status: 400 });
        }
        const row = await client.sbPatch('router_models', `id=eq.${encodeURIComponent(modelId)}`, { enabled });
        return NextResponse.json({ ok: true, model: row });
      }

      case 'set_priority': {
        const { modelId, priority } = body as { modelId?: string; priority?: number };
        if (!modelId || typeof priority !== 'number' || !Number.isInteger(priority)) {
          return NextResponse.json({ ok: false, error: 'modelId and integer priority required' }, { status: 400 });
        }
        const row = await client.sbPatch('router_models', `id=eq.${encodeURIComponent(modelId)}`, { priority });
        return NextResponse.json({ ok: true, model: row });
      }

      case 'clear_health': {
        const { routeId, model } = body as { routeId?: string; model?: string };
        if (!routeId || typeof model !== 'string') {
          return NextResponse.json({ ok: false, error: 'routeId and model (string, "" for route-wide) required' }, { status: 400 });
        }
        // Revive: back to healthy, zero the failure/backoff state, drop the cooldown.
        // No matching row is a no-op — "no health row" already means healthy per spec.
        const row = await client.sbPatch(
          'router_health',
          `route_id=eq.${encodeURIComponent(routeId)}&model=eq.${encodeURIComponent(model)}`,
          {
            status: 'healthy',
            reason: null,
            failure_count: 0,
            backoff_seconds: 0,
            retry_after: null,
            updated_at: new Date().toISOString(),
          },
        );
        return NextResponse.json({ ok: true, health: row });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'router update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
