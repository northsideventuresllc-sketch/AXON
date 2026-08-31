import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import {
  describeSupabaseMcpState,
  hasSupabaseMcpKey,
  supabaseMcpRegistryRow,
  SUPABASE_MCP_NAME,
} from '@/lib/axon-v0/mcp-supabase.mjs';

export const dynamic = 'force-dynamic';

// Problem #9 — MCP build system, first wired case: Supabase.
//
// GET   — plain-English connection state only. Never writes anything.
// POST  — same check, then (if reachable) upserts the `supabase` row into
//   nvg_skill_registry (scope='mcp') so it shows up in the Skills & MCP
//   page's MCP Servers list, same as a real skill row. If the key is
//   missing or the check fails, it still records the row — status
//   'proposed' (Off) — so the account gets a real, honest, plain-English
//   "needs a key" state instead of nothing happening.
//
// Fail-safe by contract, same as app/api/axon-v0/skills/route.ts: any
// failure (missing creds, missing table, network) returns 200 with a
// plain-English reason and never leaks table names, status codes, or the
// key itself.

function sbClient() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) return null;
  return createSupabaseClient(key) as {
    sbSelect: (t: string, f?: string) => Promise<Record<string, unknown>[]>;
    sbInsert: (t: string, r: unknown) => Promise<unknown>;
    sbPatch: (t: string, f: string, r: unknown) => Promise<unknown>;
  };
}

/** Attempt one cheap live read to prove the key actually works, not just that
 *  it is set. Never throws — a failure here just means `verified: false`. */
async function checkConnection(): Promise<{ hasKey: boolean; verified: boolean }> {
  const hasKey = hasSupabaseMcpKey(process.env);
  if (!hasKey) return { hasKey: false, verified: false };

  const client = sbClient();
  if (!client) return { hasKey: false, verified: false };

  try {
    await client.sbSelect('nvg_skill_registry', 'select=name&limit=1');
    return { hasKey: true, verified: true };
  } catch {
    return { hasKey: true, verified: false };
  }
}

export async function GET() {
  try {
    const { hasKey, verified } = await checkConnection();
    const state = describeSupabaseMcpState({ hasKey, verified });
    return NextResponse.json(state);
  } catch {
    return NextResponse.json(
      describeSupabaseMcpState({ hasKey: false, verified: false })
    );
  }
}

export async function POST() {
  try {
    const { hasKey, verified } = await checkConnection();
    const state = describeSupabaseMcpState({ hasKey, verified });

    const client = sbClient();
    if (!client) {
      // No key at all, so nothing to write against — report the state and
      // stop. Nothing was created; the page shows "Needs a key" as-is.
      return NextResponse.json({ ...state, saved: false });
    }

    const row = supabaseMcpRegistryRow(state);
    const existing = await client
      // EXEMPT from assertSkillToggleAllowed on purpose: the name written here is
      // always the hardcoded SUPABASE_MCP_NAME constant, never caller-supplied, so no
      // golden skill can be reached. If this route is EVER parameterized by name, it
      // must call the guard first or it becomes a bypass.
      .sbSelect('nvg_skill_registry', `select=name&name=eq.${SUPABASE_MCP_NAME}`)
      .catch(() => []);

    if (Array.isArray(existing) && existing.length > 0) {
      await client.sbPatch('nvg_skill_registry', `name=eq.${SUPABASE_MCP_NAME}`, {
        status: row.status,
        purpose: row.purpose,
      });
    } else {
      await client.sbInsert('nvg_skill_registry', row);
    }

    return NextResponse.json({ ...state, saved: true });
  } catch {
    return NextResponse.json({
      connected: false,
      status: 'check_failed',
      label: 'Could not connect right now',
      detail: 'Something went wrong reaching the registry — nothing was saved.',
      saved: false,
    });
  }
}
