#!/usr/bin/env node
/**
 * CM6 — Notify JB on Telegram when Content Machine posts are pending approval.
 * 2026-07-14/16: Match Fit brand is skipped unless AXON_CM6_ALLOW_MATCH_FIT=1 /
 * CONTENT_MACHINE_ALLOW_MATCH_FIT=1. MF content → match-fit.net/admin, not AXON Telegram.
 */
import { loadConfig } from '../lib/config.mjs';
import {
  allowMatchFitContentTelegram,
  groupPendingBatches,
  isMatchFitContentBlocked,
  sendBatchNotification,
} from '../lib/content-machine-telegram.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { recordDraftNotification } from '../lib/telegram-handler.mjs';

async function main() {
  console.log(`AXON Content Machine notify — ${new Date().toISOString()}`);
  if (!allowMatchFitContentTelegram()) {
    console.log(
      'Match Fit CM6 Telegram paused — fetching non-MF brands only (set AXON_CM6_ALLOW_MATCH_FIT=1 to re-enable MF)',
    );
  }
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createSupabaseClient(key);
  const cfg = await loadConfig(sb.sbSelect);

  if (!cfg.telegramToken || !cfg.telegramChatId) {
    console.log('Telegram not configured — exiting');
    return;
  }

  const batches = await groupPendingBatches(sb.sbSelect);
  if (batches.size === 0) {
    console.log('No pending content batches (Match Fit excluded unless allow flag)');
    return;
  }

  let notified = 0;
  for (const [, posts] of batches) {
    if (isMatchFitContentBlocked(posts[0])) {
      console.log(`Skip Match Fit batch ${posts[0]?.batch_id || posts[0]?.id} — AXON CM6 MF paused`);
      continue;
    }

    const already = posts.every((p) => p.meta?.telegram_notified);
    if (already) {
      console.log(`Skip batch ${posts[0]?.batch_id || posts[0]?.id} — already notified`);
      continue;
    }

    try {
      const text = await sendBatchNotification(cfg, sb, posts);
      if (!text) continue;
      await recordDraftNotification(sb, cfg.telegramChatId, text);
      notified++;
      console.log(`Notified batch: ${posts[0]?.brand_slug} · ${posts.length} post(s)`);
    } catch (err) {
      console.warn(`Notify failed: ${err.message}`);
    }
  }

  console.log(`Done. Sent ${notified} batch notification(s).`);
}

main().catch((err) => {
  console.error('AXON content batch notify failed:', err.message);
  process.exit(1);
});
