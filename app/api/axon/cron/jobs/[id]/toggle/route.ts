import { NextRequest, NextResponse } from 'next/server';
import { toggleCronJob } from '@/lib/axon-cron-service';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const enabled = typeof body?.enabled === 'boolean' ? body.enabled : Boolean(body?.enabled);
    // Enabling a scheduled job arms an automation — gate it. Disabling is always allowed.
    if (enabled) await assertFireAllowed('cron.toggle');
    const job = await toggleCronJob(id, enabled);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { ok: false, error: err.message, hold: true, action: err.action },
        { status: 423 },
      );
    }
    const message = err instanceof Error ? err.message : 'toggle failed';
    const status = message.includes('Unknown') ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
