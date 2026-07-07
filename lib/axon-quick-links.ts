import { IT_QUICK_LINKS } from './it-quick-links';
import { getClient } from './leads';

export const MAX_QUICK_LINKS = 10;
export const QUICK_LINKS_STORAGE_KEY = 'axon.quickLinks.v1';

export interface AxonQuickLink {
  id?: string;
  label: string;
  href: string;
  sort_order?: number;
}

export const DEFAULT_QUICK_LINKS: AxonQuickLink[] = IT_QUICK_LINKS.map((link, index) => ({
  label: link.name,
  href: link.href,
  sort_order: index + 1,
}));

function normalizeLinks(links: AxonQuickLink[]): AxonQuickLink[] {
  return links
    .filter((l) => l.label?.trim() && l.href?.trim())
    .slice(0, MAX_QUICK_LINKS)
    .map((l, i) => ({
      ...l,
      label: l.label.trim(),
      href: l.href.trim(),
      sort_order: i + 1,
    }));
}

export function readQuickLinksFromStorage(): AxonQuickLink[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUICK_LINKS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return normalizeLinks(parsed as AxonQuickLink[]);
  } catch {
    return null;
  }
}

export function writeQuickLinksToStorage(links: AxonQuickLink[]): AxonQuickLink[] {
  const next = normalizeLinks(links);
  if (typeof window !== 'undefined') {
    localStorage.setItem(QUICK_LINKS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export async function fetchQuickLinksFromDb(): Promise<AxonQuickLink[] | null> {
  try {
    const { sbSelect } = getClient();
    const rows = (await sbSelect(
      'axon_quick_links',
      'is_global=eq.true&select=id,label,href,sort_order&order=sort_order.asc&limit=10'
    )) as { id: string; label: string; href: string; sort_order: number }[];

    if (!rows?.length) return null;
    return normalizeLinks(
      rows.map((row) => ({
        id: row.id,
        label: row.label,
        href: row.href,
        sort_order: row.sort_order,
      }))
    );
  } catch {
    return null;
  }
}

export async function saveQuickLinksToDb(links: AxonQuickLink[]): Promise<AxonQuickLink[]> {
  const next = normalizeLinks(links);
  const { sbSelect, sbPatch, sbInsert } = getClient();

  const existing = (await sbSelect(
    'axon_quick_links',
    'is_global=eq.true&select=id&order=sort_order.asc&limit=20'
  )) as { id: string }[];

  for (let i = 0; i < next.length; i++) {
    const link = next[i];
    const row = {
      label: link.label,
      href: link.href,
      sort_order: i + 1,
      is_global: true,
      updated_at: new Date().toISOString(),
    };

    if (existing[i]?.id) {
      await sbPatch('axon_quick_links', `id=eq.${existing[i].id}`, row);
      link.id = existing[i].id;
    } else {
      const created = (await sbInsert('axon_quick_links', row)) as { id: string };
      link.id = created.id;
    }
  }

  return next;
}

export function resolveQuickLinks(
  dbLinks: AxonQuickLink[] | null,
  storageLinks: AxonQuickLink[] | null
): AxonQuickLink[] {
  return storageLinks ?? dbLinks ?? DEFAULT_QUICK_LINKS;
}
