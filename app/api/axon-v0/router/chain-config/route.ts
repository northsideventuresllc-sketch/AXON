import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';
import { DEFAULT_LLM_CHAIN, PLATFORM_ACCOUNT_ID } from '@/lib/axon-router-core.mjs';
import { listAccountKeyStatus } from '@/lib/axon-account-keys';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const TIERS = ['local', 'runpod', 'openrouter', 'gemini', 'anthropic'] as const;
type Tier = (typeof TIERS)[number];

function hdrs() {
  const key = supabaseKey();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs() });
  if (!r.ok) return [] as any[];
  return (await r.json()) as any[];
}

/**
 * GET — this account's locked 5-tier LLM chain (local / RunPod / OpenRouter / Gemini /
 * Anthropic), in its own order, with enabled/disabled and whether it has its own key on file
 * for that provider (last4 only — never the key itself). Falls back to the platform default
 * order when the account has never customized it.
 */
export async function GET() {
  try {
    const account = await getAccount();
    const accountId = account?.id ?? null;

    let rows = accountId
      ? await sbGet(`axon_llm_chain?select=*&account_id=eq.${accountId}&order=position.asc`)
      : [];
    let usingDefault = false;
    if (!rows.length) {
      rows = await sbGet(`axon_llm_chain?select=*&account_id=eq.${PLATFORM_ACCOUNT_ID}&order=position.asc`);
      usingDefault = true;
    }
    if (!rows.length) {
      rows = DEFAULT_LLM_CHAIN.map((tier: string, i: number) => ({ tier, position: i, enabled: true }));
      usingDefault = true;
    }

    const keyStatus = accountId ? await listAccountKeyStatus(supabaseKey(), accountId) : {};

    const tiers = rows
      .slice()
      .sort((a: any, b: any) => a.position - b.position)
      .map((row: any) => ({
        tier: row.tier as Tier,
        position: row.position,
        enabled: row.enabled !== false,
        hasOwnKey: row.tier !== 'local' ? !!keyStatus[row.tier] : false,
        last4: row.tier !== 'local' ? keyStatus[row.tier]?.last4 ?? null : null,
      }));

    return NextResponse.json({ tiers, usingDefault });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load the LLM chain' },
      { status: 500 },
    );
  }
}

/**
 * PUT body: { tiers: [{ tier, position, enabled }, ...] } — must cover exactly the 5 locked
 * tiers (reordering/enabling only, never adding or removing a tier).
 * { reset: true } deletes the account's own rows so it falls back to the platform default.
 */
export async function PUT(req: Request) {
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'No account' }, { status: 400 });
    const body = await req.json();

    if (body.reset) {
      await fetch(`${SUPABASE_URL}/rest/v1/axon_llm_chain?account_id=eq.${account.id}`, {
        method: 'DELETE',
        headers: hdrs(),
      });
      return NextResponse.json({ ok: true, reset: true });
    }

    const tiers = Array.isArray(body.tiers) ? body.tiers : null;
    if (!tiers || tiers.length !== TIERS.length) {
      return NextResponse.json({ error: `Must send all ${TIERS.length} chain tiers` }, { status: 400 });
    }
    const seen = new Set<string>();
    for (const t of tiers) {
      if (!TIERS.includes(t.tier) || seen.has(t.tier) || typeof t.position !== 'number') {
        return NextResponse.json({ error: `Invalid tier entry: ${JSON.stringify(t)}` }, { status: 400 });
      }
      seen.add(t.tier);
    }

    const rows = tiers.map((t: any) => ({
      account_id: account.id,
      tier: t.tier,
      position: t.position,
      enabled: t.enabled !== false,
      updated_at: new Date().toISOString(),
    }));

    const r = await fetch(`${SUPABASE_URL}/rest/v1/axon_llm_chain`, {
      method: 'POST',
      headers: { ...hdrs(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!r.ok) return NextResponse.json({ error: 'Could not save the chain' }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save the LLM chain' },
      { status: 500 },
    );
  }
}
