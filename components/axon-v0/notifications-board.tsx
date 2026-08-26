'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { NotificationDetailModal, Notification } from './notification-detail-modal';
import './notifications.css';

const READ_KEY = 'axon.v0.notif.read';
const ARCHIVED_KEY = 'axon.v0.notif.archived';

function loadIds(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveIds(key: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    /* private window / storage blocked — non-fatal */
  }
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
    return '';
  }
}

export function NotificationsBoard({ bare = false }: { bare?: boolean }) {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [active, setActive] = useState<Notification | null>(null);

  useEffect(() => {
    setRead(loadIds(READ_KEY));
    setArchived(loadIds(ARCHIVED_KEY));
  }, []);

  useEffect(() => {
    fetch(apiUrl('/api/axon-v0/notifications'))
      .then((r) => r.json())
      .then((d) => setNotes(Array.isArray(d.notifications) ? d.notifications : []))
      .catch(() => setNotes([]));
  }, []);

  const markRead = useCallback((id: string) => {
    setRead((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveIds(READ_KEY, next);
      return next;
    });
  }, []);

  const archive = useCallback((id: string) => {
    setArchived((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveIds(ARCHIVED_KEY, next);
      return next;
    });
    setActive(null);
  }, []);

  const openNote = useCallback(
    (n: Notification) => {
      setActive(n);
      markRead(n.id);
    },
    [markRead]
  );

  const visible = useMemo(() => {
    const live = notes.filter((n) => !archived.has(n.id));
    return filter === 'unread' ? live.filter((n) => !read.has(n.id)) : live;
  }, [notes, archived, read, filter]);

  const unreadCount = useMemo(
    () => notes.filter((n) => !archived.has(n.id) && !read.has(n.id)).length,
    [notes, archived, read]
  );

  const Wrap: React.ElementType = bare ? 'div' : 'section';
  return (
    <Wrap className={bare ? 'px-3 py-1' : 'v0-panel p-4'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
          {bare ? '' : 'Notifications'}
          {unreadCount > 0 && (
            <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] text-cyan-200">
              {unreadCount} unread
            </span>
          )}
        </p>
        <div className="flex gap-1.5">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`v0-chip ${filter === f ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
            >
              {f === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
      </div>

      <div className="v0-scroll mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {visible.length === 0 && (
          <p className="text-xs text-slate-500">
            {filter === 'unread' ? 'Nothing unread.' : 'All quiet.'}
          </p>
        )}
        {visible.map((n) => {
          const unread = !read.has(n.id);
          return (
            <button
              key={n.id}
              onClick={() => openNote(n)}
              className={`nt-row block w-full rounded-lg border border-cyan-400/10 bg-black/30 px-3 py-2 text-left ${
                unread ? 'nt-unread' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`truncate text-xs ${unread ? 'text-cyan-50' : 'text-slate-300'}`}>
                  {n.title}
                </p>
                <span className="flex shrink-0 items-center gap-1.5">
                  {unread && <span className="nt-dot" aria-hidden />}
                  <span className="text-[10px] text-slate-500">{fmtTime(n.created_at)}</span>
                </span>
              </div>
              {n.body && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{n.body}</p>
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <NotificationDetailModal
          note={active}
          isRead={read.has(active.id)}
          onClose={() => setActive(null)}
          onMarkRead={markRead}
          onArchive={archive}
        />
      )}
    </Wrap>
  );
}
