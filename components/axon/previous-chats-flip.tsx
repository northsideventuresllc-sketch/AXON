'use client';

import type { ReactNode } from 'react';
import type { ChatSession } from '@/lib/axon-chat-sessions';

interface PreviousChatsFlipProps {
  flipped: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  loadingSessions?: boolean;
  onOpenPrevious: () => void;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  children: ReactNode;
  className?: string;
}

export function PreviousChatsFlip({
  flipped,
  sessions,
  activeSessionId,
  loadingSessions,
  onOpenPrevious,
  onBack,
  onSelectSession,
  children,
  className = '',
}: PreviousChatsFlipProps) {
  return (
    <div className={`axon-chats-flip-scene ${className}`}>
      <div className={`axon-chats-flip-card ${flipped ? 'is-flipped' : ''}`}>
        <div className="axon-chats-flip-face axon-chats-flip-front axon-card-3d flex min-h-0 flex-col rounded-2xl border border-axon-border/50 axon-glass">
          {children}
          <div className="axon-chats-flip-footer shrink-0 border-t border-axon-border/40 px-4 py-2.5">
            <button
              type="button"
              onClick={onOpenPrevious}
              className="axon-chats-nav-link mx-auto block w-full text-center"
            >
              PREVIOUS CHATS
            </button>
          </div>
        </div>

        <div className="axon-chats-flip-face axon-chats-flip-back axon-card-3d flex min-h-0 flex-col rounded-2xl border border-axon-border/50 axon-glass">
          <div className="shrink-0 border-b border-axon-border/50 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-axon-blue-glow">Previous Chats</p>
          </div>

          <div className="axon-chats-session-list min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {loadingSessions && sessions.length === 0 && (
              <p className="py-8 text-center text-sm text-axon-muted">Loading chat history…</p>
            )}
            {!loadingSessions && sessions.length === 0 && (
              <p className="py-8 text-center text-sm text-axon-muted">No previous chats yet.</p>
            )}
            <ul className="space-y-2">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const date = new Date(session.updatedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className={`axon-chats-session-item w-full rounded-xl border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-axon-cyan/50 bg-axon-cyan/10'
                          : 'border-axon-border/50 bg-axon-elevated/40 hover:border-axon-blue-glow/40 hover:bg-axon-elevated/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-axon-text line-clamp-1">{session.title}</p>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-axon-muted">
                          {session.messageCount} msgs
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-axon-muted line-clamp-2">{session.preview}</p>
                      <p className="mt-2 text-[10px] text-axon-muted/80">{date}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="axon-chats-flip-footer shrink-0 border-t border-axon-border/40 px-4 py-2.5">
            <button
              type="button"
              onClick={onBack}
              className="axon-chats-nav-link mx-auto block w-full text-center"
            >
              BACK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
