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
import {
  buildPostingConfirmationNotification,
  validatePostingConfirmationPayload,
} from '@/lib/match-fit-posting-confirmation.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_SECRET_HEADER = 'x-match-fit-webhook-secret';

function checkWebhookSecret(req: Request): boolean {
  const secret = process.env.MATCH_FIT_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get(WEBHOOK_SECRET_HEADER);
  return header === secret;
}

export async function POST(req: Request) {
  if (!checkWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed JSON body' }, { status: 400 });
  }

  const validation = validatePostingConfirmationPayload(body);
  if (!validation.ok || !validation.data) {
    return NextResponse.json(
      { ok: false, error: validation.error ?? 'Invalid payload' },
      { status: 400 },
    );
  }

  const { batchId, posts } = validation.data;

  try {
    const notification = buildPostingConfirmationNotification({ batchId, posts });
    await addNotification(notification);
    return NextResponse.json({
      ok: true,
      batchId,
      postsRecorded: posts.length,
    });
  } catch (err) {
    console.error('Match Fit posting-confirmation webhook failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to record confirmation' },
      { status: 500 },
    );
  }
}
