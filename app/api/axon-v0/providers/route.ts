import { NextResponse } from 'next/server';
import { addProvider, listProviders, setAssignment } from '@/lib/axon-v0/store';

export async function GET() {
  try {
    return NextResponse.json({ providers: await listProviders() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load providers' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Assignment update: { assign: { agentId, mode, providerId } }
    if (body.assign) {
      const { agentId, mode, providerId } = body.assign;
      if (!agentId || !['auto', 'fixed'].includes(mode)) {
        return NextResponse.json({ error: 'agentId and valid mode required' }, { status: 400 });
      }
      await setAssignment({ agent_id: agentId, mode, provider_id: providerId || null });
      return NextResponse.json({ ok: true });
    }
    // New provider: { label, kind, base_url?, model, api_key? }
    const { label, kind, base_url, model, api_key } = body;
    if (!label?.trim() || !model?.trim()) {
      return NextResponse.json({ error: 'label and model required' }, { status: 400 });
    }
    const provider = await addProvider({
      label: label.trim(),
      kind: kind || 'openai-compatible',
      base_url: base_url?.trim() || undefined,
      model: model.trim(),
      api_key: api_key?.trim() || undefined,
    });
    return NextResponse.json({ provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Provider update failed' },
      { status: 500 }
    );
  }
}
