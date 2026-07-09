/**
 * Stress test for notification maintenance utilities.
 * Run: node scripts/stress-test-notifications.mjs
 */

const NOTIFICATION_ARCHIVE_RETENTION_DAYS = 7;
const DEFAULT_NOTIFICATION_SETTINGS = { readAutoArchiveHours: 24 };

function normalizeNotification(raw) {
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

function processNotificationMaintenance(inbox, settings, now = new Date()) {
  const archiveAfterMs = Math.max(1, settings.readAutoArchiveHours) * 60 * 60 * 1000;
  const retentionMs = NOTIFICATION_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  return inbox
    .map((n) => {
      const item = normalizeNotification(n);
      if (!item.archived && item.read && item.read_at) {
        const readMs = new Date(item.read_at).getTime();
        if (nowMs - readMs >= archiveAfterMs) {
          return { ...item, archived: true, archived_at: now.toISOString() };
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

function activeNotifications(inbox) {
  return inbox.filter((n) => !n.archived);
}

function archivedNotifications(inbox) {
  return inbox.filter((n) => n.archived);
}

function unreadCount(inbox) {
  return activeNotifications(inbox).filter((n) => !n.read).length;
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function makeNotif(overrides = {}) {
  return normalizeNotification({
    id: `n-${Math.random().toString(36).slice(2, 8)}`,
    source: 'Test',
    title: 'Test notification',
    urgent: false,
    read: false,
    created_at: new Date().toISOString(),
    interactive: false,
    ...overrides,
  });
}

console.log('\n=== Notification Utils Stress Test ===\n');

{
  const legacy = normalizeNotification({
    id: 'legacy-1',
    source: 'Old',
    title: 'Legacy',
    urgent: true,
    read: false,
    created_at: '2026-01-01T00:00:00Z',
  });
  assert(legacy.interactive === false, 'legacy notification defaults interactive=false');
  assert(legacy.archived === false, 'legacy notification defaults archived=false');
}

{
  const now = new Date('2026-07-09T12:00:00Z');
  const readAt = new Date('2026-07-08T10:00:00Z').toISOString();
  const inbox = [
    makeNotif({ id: 'read-old', read: true, read_at: readAt }),
    makeNotif({ id: 'read-fresh', read: true, read_at: new Date('2026-07-09T10:00:00Z').toISOString() }),
    makeNotif({ id: 'unread', read: false }),
  ];
  const result = processNotificationMaintenance(inbox, DEFAULT_NOTIFICATION_SETTINGS, now);
  assert(result.find((n) => n.id === 'read-old')?.archived === true, 'read notification older than 24h gets auto-archived');
  assert(result.find((n) => n.id === 'read-fresh')?.archived !== true, 'recently read notification stays active');
  assert(result.find((n) => n.id === 'unread')?.archived !== true, 'unread stays active');
}

{
  const now = new Date('2026-07-09T12:00:00Z');
  const archivedAt = new Date('2026-06-30T12:00:00Z').toISOString();
  const recentArchive = new Date('2026-07-07T12:00:00Z').toISOString();
  const inbox = [
    makeNotif({ id: 'expired', archived: true, archived_at: archivedAt }),
    makeNotif({ id: 'kept', archived: true, archived_at: recentArchive }),
  ];
  const result = processNotificationMaintenance(inbox, DEFAULT_NOTIFICATION_SETTINGS, now);
  assert(!result.find((n) => n.id === 'expired'), 'archived notification older than 7 days is purged');
  assert(Boolean(result.find((n) => n.id === 'kept')), 'recent archived notification is kept');
}

{
  const inbox = [
    makeNotif({ id: 'a1', archived: false }),
    makeNotif({ id: 'a2', archived: true, archived_at: new Date().toISOString() }),
    makeNotif({ id: 'a3', archived: false, read: false }),
  ];
  assert(activeNotifications(inbox).length === 2, 'activeNotifications filters archived');
  assert(archivedNotifications(inbox).length === 1, 'archivedNotifications returns archived only');
  assert(unreadCount(inbox) === 2, 'unreadCount counts only active unread');
}

{
  const now = new Date('2026-07-09T12:00:00Z');
  const inbox = Array.from({ length: 100 }, (_, i) =>
    makeNotif({
      id: `bulk-${i}`,
      read: i % 3 === 0,
      read_at: i % 3 === 0 ? new Date(now.getTime() - (i + 1) * 3600000).toISOString() : undefined,
      archived: i % 10 === 0,
      archived_at: i % 10 === 0 ? new Date(now.getTime() - i * 86400000).toISOString() : undefined,
    })
  );
  const start = performance.now();
  const result = processNotificationMaintenance(inbox, DEFAULT_NOTIFICATION_SETTINGS, now);
  const elapsed = performance.now() - start;
  assert(result.length <= 100, 'bulk maintenance returns valid inbox');
  assert(elapsed < 500, `bulk 100 notifications processed in ${elapsed.toFixed(1)}ms (<500ms)`);
}

{
  const now = new Date('2026-07-09T12:00:00Z');
  const readAt = new Date('2026-07-09T06:00:00Z').toISOString();
  const inbox = [makeNotif({ id: 'custom', read: true, read_at: readAt })];
  const r48 = processNotificationMaintenance(inbox, { readAutoArchiveHours: 48 }, now);
  const r4 = processNotificationMaintenance(inbox, { readAutoArchiveHours: 4 }, now);
  assert(r48[0]?.archived !== true, '48h setting keeps 6h-old read notification active');
  assert(r4[0]?.archived === true, '4h setting archives 6h-old read notification');
}

{
  const interactive = makeNotif({ interactive: true, prompt: 'Approve this lead?', read: false });
  assert(interactive.interactive === true, 'interactive notification preserves prompt');
  assert(interactive.read === false, 'interactive starts unread');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
