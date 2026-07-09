import {
  NOTIFICATION_ARCHIVE_RETENTION_DAYS,
  type AxonNotification,
  type NotificationSettings,
} from './axon-types';

export function normalizeNotification(raw: Partial<AxonNotification> & Pick<AxonNotification, 'id' | 'source' | 'title' | 'created_at'>): AxonNotification {
  return {
    id: raw.id,
    source: raw.source,
    title: raw.title,
    body: raw.body,
    urgent: raw.urgent ?? false,
    href: raw.href,
    links: raw.links,
    read: raw.read ?? false,
    read_at: raw.read_at,
    created_at: raw.created_at,
    interactive: raw.interactive ?? false,
    prompt: raw.prompt,
    archived: raw.archived ?? false,
    archived_at: raw.archived_at,
    resolved: raw.resolved ?? false,
    declined: raw.declined ?? false,
  };
}

export function isActiveNotification(n: AxonNotification): boolean {
  return !n.archived;
}

export function isArchivedNotification(n: AxonNotification): boolean {
  return Boolean(n.archived);
}

/** Run auto-archive for read notifications and purge expired archives. */
export function processNotificationMaintenance(
  inbox: AxonNotification[],
  settings: NotificationSettings,
  now = new Date()
): AxonNotification[] {
  const archiveAfterMs = Math.max(1, settings.readAutoArchiveHours) * 60 * 60 * 1000;
  const retentionMs = NOTIFICATION_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  return inbox
    .map((n) => {
      const item = normalizeNotification(n);

      if (!item.archived && item.read && item.read_at) {
        const readMs = new Date(item.read_at).getTime();
        if (nowMs - readMs >= archiveAfterMs) {
          return {
            ...item,
            archived: true,
            archived_at: now.toISOString(),
          };
        }
      }

      return item;
    })
    .filter((n) => {
      if (!n.archived || !n.archived_at) return true;
      const archivedMs = new Date(n.archived_at).getTime();
      return nowMs - archivedMs < retentionMs;
    });
}

export function sortNotificationsNewestFirst(inbox: AxonNotification[]): AxonNotification[] {
  return [...inbox].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function activeNotifications(inbox: AxonNotification[]): AxonNotification[] {
  return sortNotificationsNewestFirst(inbox.filter(isActiveNotification));
}

export function archivedNotifications(inbox: AxonNotification[]): AxonNotification[] {
  return sortNotificationsNewestFirst(inbox.filter(isArchivedNotification));
}

export function unreadCount(inbox: AxonNotification[]): number {
  return activeNotifications(inbox).filter((n) => !n.read).length;
}
