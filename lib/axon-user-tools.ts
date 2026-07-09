export type AxonUserToolSource = 'outreach_engine' | 'it_clone' | 'custom';

export interface AxonUserTool {
  slug: string;
  defaultDisplayName: string;
  href: string;
  icon: string;
  sourceType: AxonUserToolSource;
}

/** Built-in AXON tools surfaced under sidebar "AXON Tools". Order = sidebar order. */
export const AXON_USER_TOOLS: AxonUserTool[] = [
  {
    slug: 'manager-dispatch',
    defaultDisplayName: 'Repo Manager Agent Dispatch',
    href: '/tools/dispatch',
    icon: '⚡',
    sourceType: 'custom',
  },
  {
    slug: 'match-fit-admin',
    defaultDisplayName: 'AXON Management',
    href: '/tools/match-fit-admin',
    icon: '🏋',
    sourceType: 'custom',
  },
  {
    slug: 'ni-outreach',
    defaultDisplayName: 'NI Outreach HQ',
    href: '/tools/ni-outreach',
    icon: '✉',
    sourceType: 'outreach_engine',
  },
  {
    slug: 'follow-up-engine',
    defaultDisplayName: 'Follow-Up Engine',
    href: '/tools/follow-up',
    icon: '↻',
    sourceType: 'outreach_engine',
  },
  {
    slug: 'hermes-sync',
    defaultDisplayName: 'NI Marketing HQ',
    href: '/tools/hermes',
    icon: '📣',
    sourceType: 'custom',
  },
  {
    slug: 'deal-tracker',
    defaultDisplayName: 'Financial Tracker',
    href: '/tools/deals',
    icon: '◆',
    sourceType: 'custom',
  },
  {
    slug: 'test-mode',
    defaultDisplayName: 'Test Mode',
    href: '/tools/test-mode',
    icon: '🧪',
    sourceType: 'custom',
  },
];

export const AXON_TOOL_NAME_STORAGE_KEY = 'axon.toolDisplayNames';
export const AXON_TOOL_LAUNCH_KEY = 'axon.toolLaunch';

export function readToolDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(AXON_TOOL_NAME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function resolveToolDisplayName(tool: AxonUserTool, names?: Record<string, string>): string {
  const custom = names?.[tool.slug]?.trim();
  return custom || tool.defaultDisplayName;
}

export function writeToolDisplayName(slug: string, displayName: string): Record<string, string> {
  const next = { ...readToolDisplayNames(), [slug]: displayName.trim() };
  localStorage.setItem(AXON_TOOL_NAME_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function markToolLaunch(slug: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AXON_TOOL_LAUNCH_KEY, slug);
}

export function consumeToolLaunch(expectedSlug: string): boolean {
  if (typeof window === 'undefined') return false;
  const value = sessionStorage.getItem(AXON_TOOL_LAUNCH_KEY);
  if (value === expectedSlug) {
    sessionStorage.removeItem(AXON_TOOL_LAUNCH_KEY);
    return true;
  }
  return false;
}
