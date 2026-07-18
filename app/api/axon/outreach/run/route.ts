import { NextResponse } from 'next/server';
import { getOutreachRunStatus, triggerOutreachRun } from '@/lib/outreach-run';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';

export async function GET() {
  try {
    const status = await getOutreachRunStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Status failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    let max = 3;
    try {
      const body = await req.json();
      if (body?.max != null) max = Number(body.max);
    } catch {
      /* default max */
    }

    await assertFireAllowed('outreach.run');
    const result = await triggerOutreachRun({ max });
    return NextResponse.json({
      ok: true,
      max: result.max,
      actionsUrl: result.actionsUrl,
      message: `Outreach run started (max ${result.max} draft${result.max === 1 ? '' : 's'}). New leads land in the queue in ~5–10 minutes.`,
    });
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { error: err.message, hold: true, action: err.action },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Run failed' },
      { status: 500 }
    );
  }
}
