import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// RETIRED 2026-08-11 (JB directive): this used to POST a GitHub Actions
// workflow_dispatch (triggerHermesDispatch) which ran on GitHub's cloud using
// paid Anthropic Sonnet. That path is retired for good — real dispatch now
// runs locally on the Mac mini via AXON (nvg-dispatch-local-runner.py),
// polling every 30s, zero GitHub/Anthropic dependency. This endpoint is kept
// so the existing "Fire" button doesn't 404; it just confirms local dispatch
// is already running instead of firing anything.
export async function POST(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Local AXON dispatch runner already handles this automatically — no manual fire needed.',
    retired: true,
  });
}
