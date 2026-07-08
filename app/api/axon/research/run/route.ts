import { NextResponse } from 'next/server';
import { dispatchResearchRun } from '@/lib/axon-research-run';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await dispatchResearchRun({
      lane: body.lane,
      force: Boolean(body.force),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Research dispatch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
