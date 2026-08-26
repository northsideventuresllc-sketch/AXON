import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';

export const dynamic = 'force-dynamic';

// SKILLS & MCP slice. Reads the account's skill registry from NI-Brain
// (`nvg_skill_registry`) via the same lightweight REST client every other
// axon-v0 route uses. Fail-safe by contract: ANY failure — missing creds,
// missing table, network — returns `{ skills: [] }` with 200 and never leaks
// table names or infra detail to the client.

export interface SkillRow {
  id: string;
  name: string;
  description?: string;
  category?: string;
  source?: string;
  enabled?: boolean;
}

// The real table has no `id` column and uses different names than the generic
// contract, so read `select *` and map common-sense fields with fallbacks. This
// keeps working whatever the underlying column names turn out to be.
function normalize(row: Record<string, unknown>, idx: number): SkillRow {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const name = str(row.name) ?? str(row.skill_name) ?? str(row.title) ?? `Skill ${idx + 1}`;
  const id = str(row.id) ?? str(row.uuid) ?? str(row.name) ?? String(idx);
  const description = str(row.description) ?? str(row.purpose) ?? str(row.summary);
  const category = str(row.category) ?? str(row.scope) ?? str(row.type);
  const source =
    str(row.source) ??
    (row.is_golden === true ? 'golden' : undefined) ??
    str(row.origin);

  // enabled: explicit boolean wins, else derive from a status-like field.
  let enabled: boolean | undefined;
  if (typeof row.enabled === 'boolean') enabled = row.enabled;
  else if (typeof row.active === 'boolean') enabled = row.active;
  else {
    const status = str(row.status);
    if (status) enabled = /^(active|enabled|live|installed)$/i.test(status);
  }

  return { id, name, description, category, source, enabled };
}

export async function GET() {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!key) return NextResponse.json({ skills: [] });

    const { sbSelect } = createSupabaseClient(key) as {
      sbSelect: (t: string, f?: string) => Promise<Record<string, unknown>[]>;
    };

    const rows = await sbSelect('nvg_skill_registry', 'select=*&order=name.asc').catch(() => []);
    const skills = Array.isArray(rows) ? rows.map(normalize) : [];

    return NextResponse.json({ skills });
  } catch {
    // Never throw, never 500, never leak infra detail.
    return NextResponse.json({ skills: [] });
  }
}
