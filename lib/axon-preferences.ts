import { getOperatorProfile, updateOperatorProfile } from './axon-profile';
import {
  normalizeNotification,
  processNotificationMaintenance,
} from './axon-notification-utils';
import {
  DEFAULT_PREFERENCES,
  type AxonNotification,
  type AxonPreferences,
  type HomeLayoutPrefs,
  type NotificationSettings,
} from './axon-types';

function parseNotificationsInbox(raw: unknown): AxonNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeNotification(item as AxonNotification));
}

function parsePreferences(contextData: Record<string, unknown> | null | undefined): AxonPreferences {
  const raw = contextData?.preferences as Partial<AxonPreferences> | undefined;
  if (!raw) return { ...DEFAULT_PREFERENCES };

  const notifications: NotificationSettings = {
    ...DEFAULT_PREFERENCES.notifications,
    ...raw.notifications,
    integrations: {
      ...DEFAULT_PREFERENCES.notifications.integrations,
      ...raw.notifications?.integrations,
    },
    urgencyRules: {
      ...DEFAULT_PREFERENCES.notifications.urgencyRules,
      ...raw.notifications?.urgencyRules,
    },
    customNotUrgent: raw.notifications?.customNotUrgent ?? [],
    readAutoArchiveHours:
      raw.notifications?.readAutoArchiveHours ?? DEFAULT_PREFERENCES.notifications.readAutoArchiveHours,
  };

  const inbox = processNotificationMaintenance(
    parseNotificationsInbox(raw.notificationsInbox),
    notifications
  );

  return {
    homeLayout: { ...DEFAULT_PREFERENCES.homeLayout, ...raw.homeLayout },
    notifications,
    notificationsInbox: inbox,
  };
}

export async function getPreferences(operatorId = 'default'): Promise<AxonPreferences> {
  const profile = await getOperatorProfile(operatorId);
  const prefs = parsePreferences(profile.context_data);

  const maintained = processNotificationMaintenance(prefs.notificationsInbox, prefs.notifications);
  if (maintained.length !== prefs.notificationsInbox.length ||
      maintained.some((n, i) => JSON.stringify(n) !== JSON.stringify(prefs.notificationsInbox[i]))) {
    await savePreferences(operatorId, { ...prefs, notificationsInbox: maintained });
    return { ...prefs, notificationsInbox: maintained };
  }

  return prefs;
}

async function savePreferences(operatorId: string, preferences: AxonPreferences) {
  const profile = await getOperatorProfile(operatorId);
  await updateOperatorProfile(operatorId, {
    context_data: {
      ...profile.context_data,
      preferences,
    },
  });
}

function patchInbox(
  prefs: AxonPreferences,
  updater: (inbox: AxonNotification[]) => AxonNotification[]
): AxonPreferences {
  const nextInbox = processNotificationMaintenance(
    updater(prefs.notificationsInbox),
    prefs.notifications
  );
  return { ...prefs, notificationsInbox: nextInbox.slice(0, 100) };
}

export async function updateHomeLayout(
  layout: HomeLayoutPrefs,
  operatorId = 'default'
): Promise<AxonPreferences> {
  const prefs = await getPreferences(operatorId);
  const next = { ...prefs, homeLayout: layout };
  await savePreferences(operatorId, next);
  return next;
}

export async function updateNotificationSettings(
  settings: Partial<NotificationSettings>,
  operatorId = 'default'
): Promise<AxonPreferences> {
  const prefs = await getPreferences(operatorId);
  const next = {
    ...prefs,
    notifications: {
      ...prefs.notifications,
      ...settings,
      integrations: { ...prefs.notifications.integrations, ...settings.integrations },
      urgencyRules: { ...prefs.notifications.urgencyRules, ...settings.urgencyRules },
    },
  };
  await savePreferences(operatorId, next);
  return next;
}

export async function addNotification(
  notification: Omit<AxonNotification, 'id' | 'read' | 'created_at' | 'read_at' | 'archived' | 'archived_at' | 'resolved' | 'declined'>,
  operatorId = 'default'
): Promise<AxonPreferences> {
  const prefs = await getPreferences(operatorId);
  const item: AxonNotification = normalizeNotification({
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    read: false,
    created_at: new Date().toISOString(),
    interactive: notification.interactive ?? false,
  });
  const next = patchInbox(prefs, (inbox) => [item, ...inbox]);
  await savePreferences(operatorId, next);
  return next;
}

export async function markNotificationRead(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const now = new Date().toISOString();
  const next = patchInbox(prefs, (inbox) =>
    inbox.map((n) => (n.id === id ? { ...n, read: true, read_at: n.read_at ?? now } : n))
  );
  await savePreferences(operatorId, next);
  return next;
}

export async function resolveNotification(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const now = new Date().toISOString();
  const next = patchInbox(prefs, (inbox) =>
    inbox.map((n) =>
      n.id === id ? { ...n, read: true, read_at: n.read_at ?? now, resolved: true } : n
    )
  );
  await savePreferences(operatorId, next);
  return next;
}

export async function declineNotification(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const now = new Date().toISOString();
  const next = patchInbox(prefs, (inbox) =>
    inbox.map((n) =>
      n.id === id
        ? { ...n, read: true, read_at: n.read_at ?? now, resolved: true, declined: true }
        : n
    )
  );
  await savePreferences(operatorId, next);
  return next;
}

export async function deleteNotification(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const next = patchInbox(prefs, (inbox) => inbox.filter((n) => n.id !== id));
  await savePreferences(operatorId, next);
  return next;
}

export async function archiveNotifications(ids: string[], operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const now = new Date().toISOString();
  const idSet = new Set(ids);
  const next = patchInbox(prefs, (inbox) =>
    inbox.map((n) =>
      idSet.has(n.id) ? { ...n, archived: true, archived_at: now } : n
    )
  );
  await savePreferences(operatorId, next);
  return next;
}

export async function reviveNotification(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const next = patchInbox(prefs, (inbox) =>
    inbox.map((n) =>
      n.id === id ? { ...n, archived: false, archived_at: undefined } : n
    )
  );
  await savePreferences(operatorId, next);
  return next;
}

export function classifyUrgency(
  source: string,
  title: string,
  settings: NotificationSettings
): boolean {
  if (!settings.urgencyEnabled) return false;
  const haystack = `${source} ${title}`.toLowerCase();
  if (settings.customNotUrgent.some((s) => haystack.includes(s.toLowerCase()))) return false;
  if (haystack.includes('error') || haystack.includes('failed')) return settings.urgencyRules.systemError;
  if (haystack.includes('won') || haystack.includes('closed')) return settings.urgencyRules.dealWon;
  if (haystack.includes('approval') || haystack.includes('pending')) {
    return settings.urgencyRules.pipelineApproval;
  }
  if (haystack.includes('reply') || haystack.includes('response')) {
    return settings.urgencyRules.outreachReply;
  }
  return false;
}
