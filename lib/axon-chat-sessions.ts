import type { ChatMessage } from './axon-types';

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  startedAt: string;
  updatedAt: string;
}

const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export function getMessageSessionId(message: ChatMessage): string | undefined {
  const id = message.metadata?.session_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function sessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser) {
    const text = firstUser.content.trim();
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
  }
  const date = new Date(messages[0]?.created_at || Date.now());
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sessionPreview(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return '';
  const text = last.content.trim();
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

/** Group a chronological message list into chat sessions. */
export function groupMessagesIntoSessions(messages: ChatMessage[]): ChatSession[] {
  if (!messages.length) return [];

  const sessions: { id: string; messages: ChatMessage[] }[] = [];

  for (const message of messages) {
    const explicitId = getMessageSessionId(message);
    const last = sessions[sessions.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    const gap =
      lastMessage && message.created_at
        ? new Date(message.created_at).getTime() - new Date(lastMessage.created_at).getTime()
        : 0;

    if (explicitId) {
      const existing = sessions.find((s) => s.id === explicitId);
      if (existing) {
        existing.messages.push(message);
      } else {
        sessions.push({ id: explicitId, messages: [message] });
      }
      continue;
    }

    if (!last || gap > SESSION_GAP_MS) {
      const implicitId = `implicit-${message.id}`;
      sessions.push({ id: implicitId, messages: [message] });
    } else {
      last.messages.push(message);
    }
  }

  return sessions
    .map((session) => ({
      id: session.id,
      title: sessionTitle(session.messages),
      preview: sessionPreview(session.messages),
      messageCount: session.messages.length,
      startedAt: session.messages[0].created_at,
      updatedAt: session.messages[session.messages.length - 1].created_at,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getLatestSessionId(messages: ChatMessage[]): string | null {
  const sessions = groupMessagesIntoSessions(messages);
  return sessions[0]?.id ?? null;
}

export function getMessagesForSession(messages: ChatMessage[], sessionId: string): ChatMessage[] {
  const sessions = groupMessagesIntoSessions(messages);
  const match = sessions.find((s) => s.id === sessionId);
  if (!match) return messages;

  if (sessionId.startsWith('implicit-')) {
    const anchorId = sessionId.replace('implicit-', '');
    const anchorIndex = messages.findIndex((m) => m.id === anchorId);
    if (anchorIndex < 0) return messages;

    const slice: ChatMessage[] = [messages[anchorIndex]];
    for (let i = anchorIndex + 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const cur = messages[i];
      const gap =
        new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime();
      const explicit = getMessageSessionId(cur);
      if (explicit || gap > SESSION_GAP_MS) break;
      slice.push(cur);
    }
    return slice;
  }

  return messages.filter((m) => getMessageSessionId(m) === sessionId);
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function tagMessageWithSession(message: ChatMessage, sessionId: string): ChatMessage {
  return {
    ...message,
    metadata: { ...message.metadata, session_id: sessionId },
  };
}

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}
