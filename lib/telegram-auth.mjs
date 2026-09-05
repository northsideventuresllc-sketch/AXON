/**
 * Which inbound Telegram chats the bot listens to — TELEGRAM-ROUTING-FIX-0905.
 * JB's private chat and the NVG Agents group are both authorized; anything
 * else is ignored. Shared by the message handler, the NVG approve taps and the
 * content-machine taps so no path can drift back to a single-chat check.
 */
export function isAuthorizedChat(cfg, chatId) {
  const allowed = [cfg?.telegramChatId, cfg?.telegramDmChatId, cfg?.telegramGroupChatId]
    .filter((v) => v != null && v !== '')
    .map(String);
  // No chat configured at all: keep the pre-existing open behaviour. The live
  // webhook never reaches here in that state (it answers 503 first), and the
  // fire-gate tests rely on an unconfigured bot handling commands.
  if (allowed.length === 0) return true;
  return allowed.includes(String(chatId));
}
