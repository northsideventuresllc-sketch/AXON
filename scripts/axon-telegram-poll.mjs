#!/usr/bin/env node
/**
 * AXON Telegram command handler — polls for JB messages (fallback when no webhook)
 */
import { loadConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { handleTelegramMessage } from '../lib/telegram-handler.mjs';
import { telegramDeleteWebhook, telegramGetUpdates } from '../lib/telegram.mjs';

const OFFSET_KEY = 'AXON_TELEGRAM_OFFSET';

async function loadOffset(sbSelect) {
  const rows = await sbSelect(
    'ni_platform_secrets',
    `key=eq.${OFFSET_KEY}&select=value&limit=1`
  );
  const val = rows?.[0]?.value;
  return val ? Number(val) : 0;
}

async function saveOffset(sbUpsertSecret, offset) {
  await sbUpsertSecret(OFFSET_KEY, String(offset));
}

async function main() {
  console.log(`AXON Telegram poll — ${new Date().toISOString()}`);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createSupabaseClient(key);
  const cfg = await loadConfig(sb.sbSelect);

  if (!cfg.telegramToken || !cfg.telegramChatId) {
    console.log('Telegram not configured — exiting');
    return;
  }

  const offset = await loadOffset(sb.sbSelect);
  await telegramDeleteWebhook(cfg.telegramToken);
  const updates = await telegramGetUpdates(cfg.telegramToken, offset || undefined);
  let nextOffset = offset;
  let replied = 0;

  for (const update of updates) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    const msg = update.message;
    if (!msg?.text) continue;

    try {
      const reply = await handleTelegramMessage(cfg, sb, msg);
      if (reply) replied++;
    } catch (err) {
      console.error('Message handler error:', err.message);
    }

    if (!cfg.dryRun) {
      await saveOffset(sb.sbUpsertSecret, nextOffset);
    }
  }

  if (nextOffset !== offset && !cfg.dryRun && replied === 0) {
    await saveOffset(sb.sbUpsertSecret, nextOffset);
  }

  console.log(`Processed ${updates.length} update(s), replied ${replied}. Offset: ${nextOffset}`);
}

main().catch((err) => {
  console.error('AXON telegram poll failed:', err.message);
  process.exit(1);
});
