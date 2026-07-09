'use client';

import { useMemo, useState } from 'react';
import type { AxonNotification } from '@/lib/axon-types';
import { activeNotifications, archivedNotifications } from '@/lib/axon-notification-utils';

interface NotificationOrganizeModalProps {
  notifications: AxonNotification[];
  onClose: () => void;
  onArchive: (ids: string[]) => Promise<void>;
}

export function NotificationOrganizeModal({
  notifications,
  onClose,
  onArchive,
}: NotificationOrganizeModalProps) {
  const active = useMemo(() => activeNotifications(notifications), [notifications]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(active.map((n) => n.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleArchive() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await onArchive(Array.from(selected));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="axon-notif-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="axon-notif-modal axon-notif-organize-modal"
        role="dialog"
        aria-labelledby="organize-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="axon-notif-modal-header">
          <h2 id="organize-title" className="text-sm uppercase tracking-[0.2em] text-axon-blue-glow">
            Organize Notifications
          </h2>
          <button type="button" onClick={onClose} className="axon-notif-icon-btn" aria-label="Close">
            ✕
          </button>
        </header>

        <p className="px-5 pt-3 text-xs text-axon-muted">
          Select notifications to archive. Archived items are permanently deleted after 7 days unless revived.
        </p>

        <div className="axon-notif-organize-actions">
          <button type="button" onClick={selectAll} className="axon-notif-text-btn">
            Select all
          </button>
          <button type="button" onClick={clearAll} className="axon-notif-text-btn">
            Clear
          </button>
        </div>

        <ul className="axon-notif-organize-list">
          {active.length === 0 && (
            <li className="px-5 py-8 text-center text-xs text-axon-muted">No active notifications.</li>
          )}
          {active.map((n) => (
            <li key={n.id}>
              <label className="axon-notif-organize-row">
                <input
                  type="checkbox"
                  checked={selected.has(n.id)}
                  onChange={() => toggle(n.id)}
                  className="accent-axon-cyan"
                />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-axon-text">{n.title}</span>
                  <span className="block truncate text-[10px] text-axon-muted">
                    {n.source} · {n.read ? 'Read' : 'Unread'}
                    {n.interactive ? ' · Interactive' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <footer className="axon-notif-modal-footer">
          <button type="button" onClick={onClose} className="axon-notif-secondary-btn">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={handleArchive}
            className="axon-notif-primary-btn"
          >
            {busy ? 'Archiving…' : `Archive (${selected.size})`}
          </button>
        </footer>
      </div>
    </div>
  );
}