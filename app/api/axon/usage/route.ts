import { NextResponse } from 'next/server';
import { USAGE_CONNECTORS, USAGE_VENTURES, type UsageConnector } from '@/lib/axon-tools-data';
import { supabaseKey } from '@/lib/axon-v0/store';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

interface LedgerRow {
  venture: string | null;
  model: string | null;
  tier: string | null;
  executor: string | null;
  cost_usd: number | null;
  called_at: string;
}

const EXECUTOR_CATEGORY: Record<string, UsageConnector['category']> = {
  api: 'ai',
  subscription: 'ai',
  local: 'local',
};

/**
 * Real spend from axon_cost_ledger, grouped into one row per lane (executor + model — the
 * closest thing the ledger has to a lane id today; it carries no account/venture-agent
 * linkage yet, so "venture" here is whatever the calling code happened to pass in, not a
 * guaranteed attribution). Falls back to the sample data only when the ledger itself can't
 * be reached, same fail-open posture as lib/axon-v0/store.ts.
 */
export async function GET() {
  try {
    const key = supabaseKey();
    if (!key) throw new Error('no service key configured');

    const since = new Date();
    since.setDate(since.getDate() - 370);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/axon_cost_ledger?select=venture,model,tier,executor,cost_usd,called_at&called_at=gte.${since.toISOString()}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } },
    );
    if (!r.ok) throw new Error(`ledger fetch failed: ${r.status}`);
    const rows = (await r.json()) as LedgerRow[];

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();

    const byLane = new Map<string, UsageConnector>();
    for (const row of rows) {
      const model = row.model || 'unknown model';
      const executor = row.executor || 'unknown';
      const laneKey = `${executor}::${model}`;
      const called = new Date(row.called_at).getTime();
      const cost = row.cost_usd || 0;

      let entry = byLane.get(laneKey);
      if (!entry) {
        entry = {
          id: laneKey,
          label: model,
          category: EXECUTOR_CATEGORY[executor] || 'ai',
          spendDay: 0,
          spendWeek: 0,
          spendMonth: 0,
          spendYear: 0,
          venture: row.venture || 'Unknown',
          capMonthly: null,
        };
        byLane.set(laneKey, entry);
      }
      if (now - called <= DAY) entry.spendDay += cost;
      if (now - called <= 7 * DAY) entry.spendWeek += cost;
      if (called >= startOfMonth) entry.spendMonth += cost;
      if (called >= startOfYear) entry.spendYear += cost;
    }

    return NextResponse.json({
      ok: true,
      live: true,
      connectors: Array.from(byLane.values()),
      ventures: USAGE_VENTURES,
      // The ledger has no account/venture-agent linkage yet — "venture" above is best-effort,
      // not a guaranteed attribution. Grouping is by (executor, model) since that's what the
      // ledger actually records; there is no lane id column to group by directly.
      gap: 'axon_cost_ledger has no lane id or account linkage yet — grouped by executor + model instead.',
    });
  } catch {
    return NextResponse.json({
      ok: true,
      live: false,
      connectors: USAGE_CONNECTORS,
      ventures: USAGE_VENTURES,
    });
  }
}
