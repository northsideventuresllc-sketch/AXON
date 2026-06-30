import { NextResponse } from 'next/server';
import { fetchLeadById, updateLeadStatus } from '@/lib/leads';
import { shortId } from '@/lib/constants.mjs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    await updateLeadStatus(id, { status: 'sent', dm_sent: true });
    return NextResponse.json({ message: `Marked LinkedIn sent for ${lead.handle} (${shortId(id)})` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    );
  }
}
