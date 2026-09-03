import { loadConfig, loadTelegramConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { handleTelegramCallback, handleTelegramMessage } from '../lib/telegram-handler.mjs';

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

// TELEGRAM-PER-AGENT-BOT-0827: a second agent's bot points its webhook at
// this same route with ?agent=<key> (e.g. .../api/telegram-webhook?agent=arceus)
// rather than needing its own route file. loadConfig resolves that agent's
// own token/chat/secret, falling back to the shared default bot if the agent
// has no dedicated bot provisioned yet.
function checkWebhookSecret(req, expectedSecret) {
  if (!expectedSecret) return true;
  const header = req.headers['x-telegram-bot-api-secret-token'];
  return header === expectedSecret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawAgent = req.query?.agent;
  if (rawAgent !== undefined && typeof rawAgent !== 'string') {
    // e.g. a repeated ?agent=a&agent=b parses as an array — reject rather
    // than silently falling back to the default bot's identity.
    return res.status(400).json({ error: 'agent must be a single value' });
  }
  const agentKey = rawAgent || undefined;

  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createSupabaseClient(key);

    // Resolve the telegram config once, before the rest of loadConfig's
    // heavier work (which, for the default bot, can call telegramGetMe),
    // so an unauthenticated request is rejected as cheaply as possible.
    // Reused below via precomputedTelegram — loadConfig must not re-fetch it.
    let telegram;
    try {
      telegram = await loadTelegramConfig(agentKey, sb.sbSelect);
    } catch (err) {
      console.error('Telegram webhook: failed to resolve telegram config:', err.message);
      return unauthorized(res);
    }
    if (!checkWebhookSecret(req, telegram.telegramWebhookSecret)) {
      return unauthorized(res);
    }

    const cfg = await loadConfig(sb.sbSelect, agentKey, telegram);

    if (!cfg.telegramToken || !cfg.telegramChatId) {
      return res.status(503).json({ error: 'Telegram not configured' });
    }

    const update = req.body;
    // Remember every chat this bot hears from (DM, group, forum supergroup).
    // getUpdates is unusable while this webhook is set, so this table is how
    // nv-vault's telegram-topics-setup.mjs finds the "NVG Agents" forum group.
    // Fire-and-forget: a failure here must never block the message itself.
    const seenChat =
      update?.message?.chat || update?.my_chat_member?.chat || update?.callback_query?.message?.chat || update?.channel_post?.chat;
    if (seenChat?.id) {
      sb.sbUpsert('axon_telegram_chats', {
        chat_id: seenChat.id,
        chat_type: seenChat.type || 'unknown',
        title: seenChat.title || seenChat.username || seenChat.first_name || null,
        is_forum: Boolean(seenChat.is_forum),
        last_seen_at: new Date().toISOString(),
      }).catch((e) => console.error('Telegram webhook: chat record failed:', e.message));
    }
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
