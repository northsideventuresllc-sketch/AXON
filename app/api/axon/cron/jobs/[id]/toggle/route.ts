import { NextRequest, NextResponse } from 'next/server';
import { toggleCronJob } from '@/lib/axon-cron-service';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const enabled = typeof body?.enabled === 'boolean' ? body.enabled : Boolean(body?.enabled);
    const job = await toggleCronJob(id, enabled);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'toggle failed';
    const status = message.includes('Unknown') ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
