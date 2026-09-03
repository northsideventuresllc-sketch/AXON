/**
 * Usage runway strip data — NI-Brain view `v_usage_runway` (Supabase project
 * kxijunwgbrlfzvgkhklo, Phase 2 lane B1: agentic-os-phase2-harness-usage.md Phase B).
 * Columns: provider, metric, used, limit, pct_used, days_left, resets_at, sampled_at.
 *
 * Lane B1 is building the collectors + view in parallel with this lane — the view may not
 * exist yet at any given moment this route is hit. A missing-relation error (Postgres
 * 42P01, surfaced by PostgREST as a 404 on the /rest/v1/v_usage_runway select) is treated
 * as "no data yet," same as a network failure: never throws, resolves to [].
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';

export interface UsageRunwayRow {
  provider: string;
  metric: string;
  used: number | null;
  limit: number | null;
  pct_used: number | null;
  days_left: number | null;
  resets_at: string | null;
  sampled_at: string | null;
}

const FIELDS = 'provider,metric,used,"limit",pct_used,days_left,resets_at,sampled_at';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<any[]> };
}

/** Every provider/metric row, ordered so the lowest days_left (most urgent) sorts first
 *  among rows that have one. Never throws — resolves to [] whenever the view doesn't
 *  exist yet, the key is unset, or the request otherwise fails. */
export async function listUsageRunway(): Promise<UsageRunwayRow[]> {
  try {
    const rows = await sb().sbSelect(
      'v_usage_runway',
      `select=${FIELDS}&order=days_left.asc.nullslast`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
