'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxonNotification } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

interface NotificationChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface NotificationDetailModalProps {
  notification: AxonNotification;
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onResolve: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRevive?: (id: string) => Promise<void>;
  archivedView?: boolean;
}

export function NotificationDetailModal({
  notification,
  onClose,
  onMarkRead,
  onResolve,
  onDecline,
  onDelete,
  onRevive,
  archivedView = false,
}: NotificationDetailModalProps) {
  const [messages, setMessages] = useState<NotificationChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionId = `notif-${notification.id}`;

  const links = notification.links ?? (notification.href ? [{ label: 'Open link', url: notification.href }] : []);

  useEffect(() => {
    if (!notification.interactive && !notification.read && !archivedView) {
      void onMarkRead(notification.id);
    }
  }, [notification.id, notification.interactive, notification.read, archivedView, onMarkRead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/axon/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          channel: 'chat',
          sessionId,
          notificationContext: {
            title: notification.title,
            source: notification.source,
            body: notification.body,
            prompt: notification.prompt,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);

      const lower = text.toLowerCase();
      if (
        lower.includes('done') ||
        lower.includes('resolved') ||
        lower.includes('complete') ||
        lower.includes('handled') ||
        lower.includes('thanks')
      ) {
        await onResolve(notification.id);
        setResolved(true);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Connection issue — try again in a moment.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, notification, onResolve, sessionId]);

  async function handleDecline() {
    await onDecline(notification.id);
    onClose();
  }

  async function handleResolve() {
    await onResolve(notification.id);
    setResolved(true);
    onClose();
  }

  async function handleDelete() {
    await onDelete(notification.id);
    onClose();
  }

  return (
    <div className="axon-notif-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`axon-notif-modal ${notification.interactive ? 'axon-notif-modal--interactive' : ''}`}
        role="dialog"
        aria-labelledby="notif-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="axon-notif-modal-header">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.15em] text-axon-muted">{notification.source}</p>
            <h2 id="notif-detail-title" className="truncate text-sm font-medium text-axon-cyan">
              {notification.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="axon-notif-icon-btn" aria-label="Close">
            ✕
          </button>
        </header>

        {notification.interactive ? (
          <>
            {notification.prompt && (
              <div className="axon-notif-prompt-banner">
                <p className="text-xs text-axon-blue-glow">{notification.prompt}</p>
              </div>
            )}
            {notification.body && (
              <p className="px-5 py-2 text-xs text-axon-muted">{notification.body}</p>
            )}

            <div ref={scrollRef} className="axon-notif-chat-scroll">
              {messages.length === 0 && (
                <p className="py-6 text-center text-xs text-axon-muted">
                  Chat with AXON to resolve this notification.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`axon-notif-chat-bubble ${m.role === 'user' ? 'axon-notif-chat-bubble--user' : ''}`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="axon-notif-chat-bubble text-axon-muted">AXON is thinking…</div>
              )}
            </div>

            <div className="axon-notif-chat-input-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Discuss with AXON…"
                className="axon-notif-chat-input"
                disabled={resolved || archivedView}
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={loading || !input.trim() || resolved || archivedView}
                className="axon-notif-primary-btn shrink-0"
              >
                Send
              </button>
            </div>

            <footer className="axon-notif-modal-footer">
              {archivedView && onRevive ? (
                <button type="button" onClick={() => onRevive(notification.id)} className="axon-notif-primary-btn">
                  Revive notification
                </button>
              ) : (
                <>
                  <button type="button" onClick={handleDecline} className="axon-notif-secondary-btn">
                    Decline to act
                  </button>
                  <button type="button" onClick={handleResolve} className="axon-notif-primary-btn">
                    Mark resolved
                  </button>
                  <button type="button" onClick={handleDelete} className="axon-notif-danger-btn">
                    Delete
                  </button>
                </>
              )}
            </footer>
          </>
        ) : (
          <>
            <div className="axon-notif-static-body">
              {notification.body && <p className="text-sm leading-relaxed text-axon-text">{notification.body}</p>}
              {links.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-axon-cyan underline underline-offset-2 hover:text-axon-blue-glow"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="axon-notif-modal-footer">
              {archivedView && onRevive ? (
                <button type="button" onClick={() => onRevive(notification.id)} className="axon-notif-primary-btn">
                  Revive notification
                </button>
              ) : (
                <>
                  <button type="button" onClick={onClose} className="axon-notif-secondary-btn">
                    Close
                  </button>
                  <button type="button" onClick={handleDelete} className="axon-notif-danger-btn">
                    Delete
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
