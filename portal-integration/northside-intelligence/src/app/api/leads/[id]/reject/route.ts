import { NextResponse } from 'next/server';
import { shortId } from '@/lib/axon/constants.mjs';
import { rejectOutreachLead } from '@/lib/axon/outreach-reject';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operatorId = await requireAxonOperatorId();
    const { id } = await params;
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.reason === 'string') reason = body.reason;
    } catch {
      /* no JSON body */
    }

    const result = await rejectOutreachLead(id, { reason, operatorId, source: 'portal' });
    if (!result) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const suffix = result.reason ? ` — ${result.reason}` : '';
    return NextResponse.json({
      message: `Rejected ${result.lead.handle} (${shortId(id)})${suffix}`,
      reason: result.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reject failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
