'use client';

import { useCallback } from 'react';
import type { AxonPreferences } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

type PreferenceAction =
  | { markReadId: string }
  | { resolveId: string }
  | { declineId: string }
  | { deleteId: string }
  | { archiveIds: string[] }
  | { reviveId: string };

export function useNotificationActions(
  onPreferencesUpdated: (prefs: AxonPreferences) => void
) {
  const patch = useCallback(
    async (action: PreferenceAction) => {
      const res = await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      if (data.preferences) onPreferencesUpdated(data.preferences);
      return data.preferences as AxonPreferences;
    },
    [onPreferencesUpdated]
  );

  return {
    markRead: (id: string) => patch({ markReadId: id }),
    resolve: (id: string) => patch({ resolveId: id }),
    decline: (id: string) => patch({ declineId: id }),
    remove: (id: string) => patch({ deleteId: id }),
    archive: (ids: string[]) => patch({ archiveIds: ids }),
    revive: (id: string) => patch({ reviveId: id }),
  };
}
