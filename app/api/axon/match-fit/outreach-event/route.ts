/**
 * Match Fit Outreach HQ v2 → AXON — outreach-event webhook receiver (Telegram bridge).
 *
 * Match Fit fires this for three event types — a fresh batch of Today's Leads, a follow-up
 * becoming due, and a new pending-response (reply) — via
 * matchfit/src/lib/outreach-axon-notify.ts. AXON surfaces each lead in Telegram with
 * Approve / Delete / Rewrite inline buttons, reusing the existing @northsideaxonbot plumbing
 * (lib/telegram.mjs). Button taps round-trip back through api/telegram-webhook.js →
 * lib/telegram-handler.mjs → lib/match-fit-outreach-actions.mjs.
 *
 * Auth: shared-secret header, SAME env var + convention as the posting-confirmation route
 * (X-Match-Fit-Webhook-Secret vs process.env.MATCH_FIT_WEBHOOK_SECRET). Fail-closed 401.
 * Route is whitelisted in middleware.ts PUBLIC_PATHS.
 */
import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config.mjs';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { telegramSendWithKeyboard } from '@/lib/telegram.mjs';
import {
  buildLeadKeyboard,
  buildLeadMessage,
  validateOutreachEventPayload,
} from '@/lib/match-fit-outreach-event.mjs';

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

  const validation = validateOutreachEventPayload(body);
  if (!validation.ok || !validation.data) {
    return NextResponse.json(
      { ok: false, error: validation.error ?? 'Invalid payload' },
      { status: 400 },
    );
  }

  const { eventType, leads, meta } = validation.data;

  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createSupabaseClient(key);
    const cfg = await loadConfig(sb.sbSelect);

    if (!cfg.telegramToken || !cfg.telegramChatId) {
      return NextResponse.json({ ok: false, error: 'Telegram not configured' }, { status: 503 });
    }

    let pushed = 0;
    for (const lead of leads) {
      const text = buildLeadMessage(eventType, lead, meta ?? {});
      const keyboard = buildLeadKeyboard(lead);
      await telegramSendWithKeyboard(
        cfg.telegramToken,
        cfg.telegramChatId,
        text,
        keyboard,
        cfg.dryRun,
      );
      pushed += 1;
    }

    return NextResponse.json({ ok: true, eventType, leadsPushed: pushed });
  } catch (err) {
    console.error('Match Fit outreach-event webhook failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to push outreach event' },
      { status: 500 },
    );
  }
}
