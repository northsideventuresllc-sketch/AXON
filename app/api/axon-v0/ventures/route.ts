import { NextResponse } from 'next/server';
import { createVenture, listAgents, listVentures, listVentureTools } from '@/lib/axon-v0/store';

export async function GET() {
  try {
    const ventures = await listVentures();
    const agents = await listAgents();
    const withAgents = await Promise.all(
      ventures.map(async (v) => ({
        ...v,
        agents: agents.filter((a) => a.venture_id === v.id),
        tools: await listVentureTools(v.id),
      }))
    );
    return NextResponse.json({ ventures: withAgents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load ventures' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { name, tagline, accent } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const venture = await createVenture(name.trim(), tagline?.trim(), accent);
    return NextResponse.json({ venture });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create venture' },
      { status: 500 }
    );
  }
}
