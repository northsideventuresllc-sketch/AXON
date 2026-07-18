import { NextResponse } from 'next/server';
import { shortId } from '@/lib/constants.mjs';
import { rejectOutreachLead } from '@/lib/outreach-reject';
import { learnStep } from '@/lib/axon-step-learn';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.reason === 'string') reason = body.reason;
    } catch {
      /* no JSON body */
    }

    const result = await rejectOutreachLead(id, { reason, source: 'api' });
    if (!result) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // One-line learning of the reject + reason — fire-and-forget.
    learnStep({
      tool: 'ni-outreach',
      step: 'reject',
      after: 'rejected',
      venture: 'NI Outreach',
      resourceId: id,
      meta: result.reason ? { reason: result.reason } : undefined,
    });

    const suffix = result.reason ? ` — ${result.reason}` : '';
    return NextResponse.json({
      message: `Rejected ${result.lead.handle} (${shortId(id)})${suffix}`,
      reason: result.reason,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reject failed' },
      { status: 500 }
    );
  }
}
