import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';
import { CHAIN_PROVIDERS, deleteAccountKey, setAccountKey } from '@/lib/axon-account-keys';

/**
 * PUT — save this account's own API key for one provider (openrouter | gemini | anthropic |
 * runpod). Overrides the NVG platform key for that account only, everywhere axonGenerate
 * walks the LLM chain. The key is AES-256-GCM encrypted at rest and never returned — only
 * last4 comes back, for the Settings UI to show "•••• 8f2a".
 *
 * DELETE — remove the account's key for that provider, reverting to the platform key.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params;
    if (!CHAIN_PROVIDERS.includes(provider as any)) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'No account' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    const { last4 } = await setAccountKey(supabaseKey(), account.id, provider, key);
    return NextResponse.json({ ok: true, provider, hasOwnKey: true, last4 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not save that key' },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await ctx.params;
    if (!CHAIN_PROVIDERS.includes(provider as any)) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'No account' }, { status: 400 });

    await deleteAccountKey(supabaseKey(), account.id, provider);
    return NextResponse.json({ ok: true, provider, hasOwnKey: false, last4: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not remove that key' },
      { status: 500 },
    );
  }
}
