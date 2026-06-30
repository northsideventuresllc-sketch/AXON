import { randomUUID } from 'node:crypto';

export async function getOrCreateConversation(sbSelect, sbInsert, sbPatch, chatId) {
  const existing = await sbSelect(
    'axon_telegram_conversations',
    `chat_id=eq.${encodeURIComponent(chatId)}&order=updated_at.desc&limit=1&select=*`
  );
  if (existing?.[0]) return existing[0];

  const row = {
    id: randomUUID(),
    chat_id: String(chatId),
    title: 'Telegram with JB',
    channel: 'telegram',
    updated_at: new Date().toISOString(),
  };
  return sbInsert('axon_telegram_conversations', row);
}

export async function saveMessage(sbInsert, sbPatch, conversationId, {
  role,
  content,
  messageType = 'chat',
  telegramMessageId = null,
  metadata = {},
}) {
  const row = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    message_type: messageType,
    telegram_message_id: telegramMessageId,
    metadata,
  };
  await sbInsert('axon_telegram_messages', row);
  await sbPatch(
    'axon_telegram_conversations',
    `id=eq.${conversationId}`,
    { updated_at: new Date().toISOString() }
  );
}

export async function loadRecentHistory(sbSelect, conversationId, limit = 20) {
  const rows = await sbSelect(
    'axon_telegram_messages',
    `conversation_id=eq.${conversationId}&message_type=in.(chat,command)&order=created_at.desc&limit=${limit}&select=role,content,created_at,message_type`
  );
  return (rows || []).reverse();
}

export async function listConversations(sbSelect, limit = 50) {
  return sbSelect(
    'axon_telegram_conversations',
    `order=updated_at.desc&limit=${limit}&select=*`
  );
}

export async function listMessages(sbSelect, conversationId, limit = 200) {
  return sbSelect(
    'axon_telegram_messages',
    `conversation_id=eq.${conversationId}&order=created_at.asc&limit=${limit}&select=*`
  );
}