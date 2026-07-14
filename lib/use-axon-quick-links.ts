'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_QUICK_LINKS,
  readQuickLinksFromStorage,
  type AxonQuickLink,
} from '@/lib/axon-quick-links';
import { apiUrl } from '@/lib/api-base';

export function useAxonQuickLinks(): AxonQuickLink[] {
  const [links, setLinks] = useState<AxonQuickLink[]>(() => {
    return readQuickLinksFromStorage() ?? DEFAULT_QUICK_LINKS;
  });

  useEffect(() => {
    const syncFromStorage = () => {
      setLinks(readQuickLinksFromStorage() ?? DEFAULT_QUICK_LINKS);
    };

    window.addEventListener('axon:quick-links-updated', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('axon:quick-links-updated', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(apiUrl('/api/axon/quick-links'));
        if (!res.ok) return;
        const data = (await res.json()) as { links?: AxonQuickLink[] };
        if (!cancelled && data.links?.length) {
          const stored = readQuickLinksFromStorage();
          setLinks(stored ?? data.links);
        }
      } catch {
        /* keep defaults / localStorage */
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return links;
}
