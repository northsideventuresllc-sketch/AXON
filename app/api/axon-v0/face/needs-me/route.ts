import { NextResponse } from 'next/server';
import { loadNeedsMe } from '@/lib/axon-v0/face-plan-reads';

/**
 * THE FACE — everything waiting on JB (Build Plan B, step 3).
 *
 * Read-only. The voice panel calls this when you ask what needs you. It lists what is
 * parked; it cannot approve, reject or fire any of it — approvals stay on the Telegram
 * button exactly as they are today.
 *
 * Source: the job queue, anything in the waiting-on-JB status or flagged as needing his
 * approval and not yet closed out. Job codes never reach the screen.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, needsMe: await loadNeedsMe() });
  } catch {
    return NextResponse.json({ ok: true, needsMe: { items: [], readable: false } });
  }
}
