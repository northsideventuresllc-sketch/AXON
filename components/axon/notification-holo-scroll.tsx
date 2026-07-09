'use client';

import { useMemo } from 'react';
import type { AxonNotification } from '@/lib/axon-types';
import { activeNotifications, archivedNotifications } from '@/lib/axon-notification-utils';

interface NotificationHoloScrollProps {
  notifications: AxonNotification[];
  showArchived: boolean;
  onToggleArchived: () => void;
  onClose: () => void;
  onOrganize: () => void;
  onSelect: (notification: AxonNotification) => void;
}

export function NotificationHoloScroll({
  notifications,
  showArchived,
  onToggleArchived,
  onClose,
  onOrganize,
  onSelect,
}: NotificationHoloScrollProps) {
  const list = useMemo(
    () => (showArchived ? archivedNotifications(notifications) : activeNotifications(notifications)),
    [notifications, showArchived]
  );

  return (
    <aside className="axon-notif-holo-scroll" aria-label="Notification scroll">
      <header className="axon-notif-holo-scroll-header">
        <button
          type="button"
          onClick={onToggleArchived}
          className={`axon-notif-holo-tab ${showArchived ? 'axon-notif-holo-tab--active' : ''}`}
        >
          {showArchived ? 'INBOX' : 'ARCHIVED'}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onOrganize} className="axon-notif-holo-organize-btn">
            ORGANIZE
          </button>
          <button type="button" onClick={onClose} className="axon-notif-icon-btn" aria-label="Close scroll">
            ✕
          </button>
        </div>
      </header>

      <ul className="axon-notif-holo-scroll-list">
        {list.length === 0 && (
          <li className="px-4 py-10 text-center text-xs text-axon-muted">
            {showArchived ? 'No archived notifications.' : 'No notifications yet.'}
          </li>
        )}
        {list.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n)}
              className={`axon-notif-holo-scroll-item ${!n.read ? 'axon-notif-holo-scroll-item--unread' : ''} ${n.urgent ? 'axon-notif-holo-scroll-item--urgent' : ''}`}
            >
              <span className="axon-notif-holo-scroll-item-glow" aria-hidden />
              <span className="block truncate text-[10px] uppercase tracking-wider text-axon-muted">
                {n.source}
              </span>
              <span className="block truncate text-sm text-axon-text">{n.title}</span>
              <span className="mt-1 flex items-center gap-2 text-[10px] text-axon-muted">
                {!n.read && <span className="text-axon-cyan">Unread</span>}
                {n.interactive && <span className="text-axon-blue-glow">Interactive</span>}
                {n.urgent && <span className="text-red-400">Urgent</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
