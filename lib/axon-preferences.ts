import { getOperatorProfile, updateOperatorProfile } from './axon-profile';
import {
  DEFAULT_PREFERENCES,
  type AxonNotification,
  type AxonPreferences,
  type HomeLayoutPrefs,
  type NotificationSettings,
} from './axon-types';

function parsePreferences(contextData: Record<string, unknown> | null | undefined): AxonPreferences {
  const raw = contextData?.preferences as Partial<AxonPreferences> | undefined;
  if (!raw) return { ...DEFAULT_PREFERENCES };

  return {
    homeLayout: { ...DEFAULT_PREFERENCES.homeLayout, ...raw.homeLayout },
    notifications: {
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
    },
    notificationsInbox: Array.isArray(raw.notificationsInbox) ? raw.notificationsInbox : [],
  };
}

export async function getPreferences(operatorId = 'default'): Promise<AxonPreferences> {
  const profile = await getOperatorProfile(operatorId);
  return parsePreferences(profile.context_data);
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
  notification: Omit<AxonNotification, 'id' | 'read' | 'created_at'>,
  operatorId = 'default'
): Promise<AxonPreferences> {
  const prefs = await getPreferences(operatorId);
  const item: AxonNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    read: false,
    created_at: new Date().toISOString(),
  };
  const next = {
    ...prefs,
    notificationsInbox: [item, ...prefs.notificationsInbox].slice(0, 50),
  };
  await savePreferences(operatorId, next);
  return next;
}

export async function markNotificationRead(id: string, operatorId = 'default') {
  const prefs = await getPreferences(operatorId);
  const next = {
    ...prefs,
    notificationsInbox: prefs.notificationsInbox.map((n) =>
      n.id === id ? { ...n, read: true } : n
    ),
  };
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
