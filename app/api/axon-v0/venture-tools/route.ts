import { NextResponse } from 'next/server';
import { assignVentureTool, listVentureTools } from '@/lib/axon-v0/store';
import { AXON_USER_TOOLS } from '@/lib/axon-user-tools';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ventureId = searchParams.get('ventureId');
    const catalog = AXON_USER_TOOLS.map((t) => ({
      slug: t.slug,
      name: t.defaultDisplayName,
      icon: t.icon,
    }));
    if (!ventureId) return NextResponse.json({ catalog, assigned: [] });
    return NextResponse.json({ catalog, assigned: await listVentureTools(ventureId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load tools' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { ventureId, toolSlug, displayName, notes } = await req.json();
    if (!ventureId || !toolSlug) {
      return NextResponse.json({ error: 'ventureId and toolSlug required' }, { status: 400 });
    }
    const assigned = await assignVentureTool({
      venture_id: ventureId,
      tool_slug: toolSlug,
      display_name: displayName,
      notes,
    });
    return NextResponse.json({ assigned });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Tool assignment failed' },
      { status: 500 }
    );
  }
}
