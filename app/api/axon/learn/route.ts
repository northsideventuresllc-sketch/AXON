import { NextResponse } from 'next/server';
import { recordStepLearning, type StepLearnEvent } from '@/lib/axon-step-learn';

export const dynamic = 'force-dynamic';

/**
 * Minimal client-side step-learning sink. Accepts one-line step events from the
 * browser for tools whose actions are client-only. Always responds 200 so a
 * learning write can never break the calling UX; failures are swallowed.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<StepLearnEvent>;
    const tool = String(body?.tool || '').trim();
    const step = String(body?.step || '').trim();
    if (!tool || !step) {
      // Bad payload — acknowledge without recording. Never error the client.
      return NextResponse.json({ ok: true, recorded: false });
    }
    const recorded = await recordStepLearning({
      tool,
      step,
      before: body?.before,
      after: body?.after,
      venture: typeof body?.venture === 'string' ? body.venture : undefined,
      meta:
        body?.meta && typeof body.meta === 'object'
          ? (body.meta as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json({ ok: true, recorded });
  } catch {
    // Learning is best-effort — always succeed from the client's perspective.
    return NextResponse.json({ ok: true, recorded: false });
  }
}
