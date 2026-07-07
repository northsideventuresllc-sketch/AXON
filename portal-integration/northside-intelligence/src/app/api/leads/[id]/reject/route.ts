import { NextResponse } from 'next/server';
import { shortId } from '@/lib/axon/constants.mjs';
import { fetchLeadById, updateLeadStatus } from '@/lib/axon/leads';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAxonOperatorId();
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    await updateLeadStatus(id, { status: 'dead' });
    return NextResponse.json({ message: `Rejected ${lead.handle} (${shortId(id)})` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reject failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
