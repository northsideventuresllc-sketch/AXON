'use client';

import { useEffect, useMemo } from 'react';
import './notifications.css';

export interface Notification {
  id: string;
  ventureId: string;
  ventureName: string;
  title: string;
  body: string;
  agentName: string;
  created_at: string;
  thread: string;
}

interface Props {
  note: Notification;
  isRead: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
}

const URL_RE = /(https?:\/\/[^\s<>()]+)/g;

function extractLinks(body: string): string[] {
  const found = body.match(URL_RE) || [];
  // de-dupe, trim trailing punctuation
  const clean = found.map((u) => u.replace(/[.,;:)\]]+$/, ''));
  return Array.from(new Set(clean));
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NotificationDetailModal({ note, isRead, onClose, onMarkRead, onArchive }: Props) {
  const links = useMemo(() => extractLinks(note.body || ''), [note.body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="nt-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={note.title}
    >
      <div className="nt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nt-grid" />
        <div className="relative flex max-h-[85vh] flex-col">
          {/* header */}
          <div className="flex items-start justify-between gap-3 border-b border-cyan-400/15 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
                {note.ventureName}
              </p>
              <h2 className="mt-1 truncate text-sm font-medium text-cyan-50">{note.agentName}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {fmtTime(note.created_at)} · {note.thread}
                {isRead ? ' · read' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="nt-btn-ghost rounded-md px-2 py-1 text-xs"
            >
              Esc
            </button>
          </div>

          {/* body */}
          <div className="v0-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">
              {note.body || 'No detail provided.'}
            </p>

            {links.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Links</p>
                <div className="flex flex-wrap gap-2">
                  {links.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nt-btn max-w-full truncate rounded-md px-3 py-1.5 text-[11px]"
                    >
                      {url.replace(/^https?:\/\//, '')}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-cyan-400/15 px-5 py-3">
            {!isRead && (
              <button
                onClick={() => onMarkRead(note.id)}
                className="nt-btn rounded-md px-3 py-1.5 text-xs"
              >
                Mark as read
              </button>
            )}
            <button
              onClick={() => onArchive(note.id)}
              className="nt-btn-ghost rounded-md px-3 py-1.5 text-xs"
            >
              Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
