import { loadConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { handleTelegramCallback, handleTelegramMessage } from '../lib/telegram-handler.mjs';

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

function checkWebhookSecret(req) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = req.headers['x-telegram-bot-api-secret-token'];
  return header === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkWebhookSecret(req)) {
    return unauthorized(res);
  }

  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createSupabaseClient(key);
    const cfg = await loadConfig(sb.sbSelect);

    if (!cfg.telegramToken || !cfg.telegramChatId) {
      return res.status(503).json({ error: 'Telegram not configured' });
    }

    const update = req.body;
    const msg = update?.message;
    if (msg?.text) {
      await handleTelegramMessage(cfg, sb, msg);
    }
    if (update?.callback_query) {
      await handleTelegramCallback(cfg, sb, update.callback_query);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
