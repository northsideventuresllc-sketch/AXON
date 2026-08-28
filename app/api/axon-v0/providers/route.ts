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
    // Assignment update: { assign: { agentId, mode, laneId } }
    // laneId is a router_models row (a route x model pair). providerId is accepted as a
    // legacy alias so an older client build keeps working through the rename.
    if (body.assign) {
      const { agentId, mode, laneId, providerId } = body.assign;
      if (!agentId || !['auto', 'fixed'].includes(mode)) {
        return NextResponse.json({ error: 'agentId and valid mode required' }, { status: 400 });
      }
      await setAssignment({ agent_id: agentId, mode, lane_id: laneId || providerId || null });
      return NextResponse.json({ ok: true });
    }
    // New custom lane: { label, kind, base_url?, model, secret_key? }
    // secret_key is the NAME of a key in ni_platform_secrets — never the value itself.
    const { label, kind, base_url, model, secret_key } = body;
    if (!label?.trim() || !model?.trim()) {
      return NextResponse.json({ error: 'label and model required' }, { status: 400 });
    }
    const provider = await addProvider({
      label: label.trim(),
      kind: kind || 'openai-compatible',
      base_url: base_url?.trim() || undefined,
      model: model.trim(),
      secret_key: secret_key?.trim() || undefined,
    });
    return NextResponse.json({ provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Provider update failed' },
      { status: 500 }
    );
  }
}
