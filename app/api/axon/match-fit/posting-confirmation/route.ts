/**
 * Match Fit Content Calendar v2.1 → AXON — posting-confirmation webhook.
 * Fired after Match Fit posts a scheduled batch; AXON records + surfaces it as an
 * operator notification (see components/axon/notifications-panel.tsx).
 *
 * Auth: shared-secret header, same convention as `api/telegram-webhook.js`.
 * Set MATCH_FIT_WEBHOOK_SECRET in this repo's deployment env, and the identical
 * value in the Match Fit repo/Vercel project as the header it sends.
 */
import { NextResponse } from 'next/server';
import { addNotification } from '@/lib/axon-preferences';
import { handlePostingConfirmationRequest } from '@/lib/match-fit-posting-confirmation.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_SECRET_HEADER = 'x-match-fit-webhook-secret';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const result = await handlePostingConfirmationRequest({
    headerSecret: req.headers.get(WEBHOOK_SECRET_HEADER),
    envSecret: process.env.MATCH_FIT_WEBHOOK_SECRET,
    rawBody,
    addNotification,
  });
  return NextResponse.json(result.body, { status: result.status });
}
