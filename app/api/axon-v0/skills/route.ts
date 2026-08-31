import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { assertSkillToggleAllowed } from '@/lib/axon-v0/skill-guard.mjs';

export const dynamic = 'force-dynamic';

// SKILLS & MCP slice. Reads the account's skill registry from NI-Brain
// (`nvg_skill_registry`) via the same lightweight REST client every other
// axon-v0 route uses. Fail-safe by contract: ANY failure — missing creds,
// missing table, network — returns `{ skills: [] }` with 200 and never leaks
// table names or infra detail to the client.
//
// GET  — list skills + MCP entries.
// PATCH — problem #8's on/off toggle. Every disable request is checked by
//   assertSkillToggleAllowed() (lib/axon-v0/skill-guard.mjs) BEFORE any write —
//   `obsidian-vault-write` can never be disabled (JB standing order), and any
//   other golden skill needs an explicit second confirmation. This is the one
//   real gate; the UI's own confirm step is a courtesy, not the enforcement.
// POST — manual create. Writes a real (but inert — status='proposed', never
//   golden) row so a hand-authored skill actually shows up in the registry
//   instead of staying a client-side draft that vanishes on refresh.

export interface SkillRow {
  id: string;
  name: string;
  description?: string;
  category?: string;
  source?: string;
  enabled?: boolean;
  isGolden?: boolean;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function deriveEnabled(row: Record<string, unknown>): boolean | undefined {
  if (typeof row.enabled === 'boolean') return row.enabled;
  if (typeof row.active === 'boolean') return row.active;
  const status = str(row.status);
  if (status) return /^(active|enabled|live|installed)$/i.test(status);
  return undefined;
}

// The real table has no `id` column and uses different names than the generic
// contract, so read `select *` and map common-sense fields with fallbacks. This
// keeps working whatever the underlying column names turn out to be.
function normalize(row: Record<string, unknown>, idx: number): SkillRow {
  const name = str(row.name) ?? str(row.skill_name) ?? str(row.title) ?? `Skill ${idx + 1}`;
  const id = str(row.id) ?? str(row.uuid) ?? str(row.name) ?? String(idx);
  const description = str(row.description) ?? str(row.purpose) ?? str(row.summary);
  const isGolden = row.is_golden === true;
  const category = str(row.category) ?? str(row.scope) ?? str(row.type);
  const source = str(row.source) ?? (isGolden ? 'golden' : undefined) ?? str(row.origin);
  const enabled = deriveEnabled(row);

  return { id, name, description, category, source, enabled, isGolden };
}

function sbClient() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) return null;
  return createSupabaseClient(key) as {
    sbSelect: (t: string, f?: string) => Promise<Record<string, unknown>[]>;
    sbInsert: (t: string, r: unknown) => Promise<unknown>;
    sbPatch: (t: string, f: string, r: unknown) => Promise<unknown>;
  };
}

function slugify(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function GET() {
  try {
    const client = sbClient();
    if (!client) return NextResponse.json({ skills: [] });

    const rows = await client.sbSelect('nvg_skill_registry', 'select=*&order=name.asc').catch(() => []);
    const skills = Array.isArray(rows) ? rows.map(normalize) : [];

    return NextResponse.json({ skills });
  } catch {
    // Never throw, never 500, never leak infra detail.
    return NextResponse.json({ skills: [] });
  }
}

// Toggle a skill on/off. Body: { name: string, enabled: boolean, confirmGolden?: boolean }.
export async function PATCH(req: Request) {
  try {
    const client = sbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, reason: 'The skill registry is not reachable right now — nothing was changed.' },
        { status: 200 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      enabled?: unknown;
      confirmGolden?: unknown;
    };
    const name = str(body.name);
    const nextEnabled = body.enabled === true;
    const confirmGolden = body.confirmGolden === true;

    if (!name) {
      return NextResponse.json({ ok: false, reason: 'No skill was specified.' }, { status: 400 });
    }

    const rows = await client
      .sbSelect('nvg_skill_registry', `select=name,is_golden&name=eq.${encodeURIComponent(name)}`)
      .catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    const isGolden = row?.is_golden === true;

    const guard = assertSkillToggleAllowed({ name, isGolden, nextEnabled, confirmGolden });
    if (!guard.allowed) {
      return NextResponse.json(
        { ok: false, blocked: true, requiresConfirm: !!guard.requiresConfirm, reason: guard.reason },
        { status: 200 }
      );
    }

    await client.sbPatch('nvg_skill_registry', `name=eq.${encodeURIComponent(name)}`, {
      status: nextEnabled ? 'active' : 'disabled',
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'Could not update that skill right now — nothing was changed.' },
      { status: 200 }
    );
  }
}

// Manually create a skill. Body: { name: string, description?: string }.
// Always lands as scope='manual', status='proposed' (Off), is_golden=false —
// a person turns it on from the Skills page once they're happy with it; it
// never comes in already golden or already on.
export async function POST(req: Request) {
  try {
    const client = sbClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, reason: 'The skill registry is not reachable right now — nothing was created.' },
        { status: 200 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
    const rawName = str(body.name);
    const description = str(body.description);
    if (!rawName) {
      return NextResponse.json({ ok: false, reason: 'Give the skill a name first.' }, { status: 400 });
    }

    const slug = slugify(rawName) || `manual-skill-${Date.now()}`;

    const existing = await client
      .sbSelect('nvg_skill_registry', `select=name&name=eq.${encodeURIComponent(slug)}`)
      .catch(() => []);
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json(
        { ok: false, reason: `A skill named "${slug}" already exists.` },
        { status: 200 }
      );
    }

    await client.sbInsert('nvg_skill_registry', {
      name: slug,
      scope: 'manual',
      status: 'proposed',
      is_golden: false,
      version: 1,
      purpose: description ?? null,
    });

    const skill = normalize(
      { name: slug, scope: 'manual', status: 'proposed', is_golden: false, purpose: description ?? null },
      0
    );

    return NextResponse.json({ ok: true, skill });
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'Could not create that skill right now.' },
      { status: 200 }
    );
  }
}
