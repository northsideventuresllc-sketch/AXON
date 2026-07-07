export type AxonUserToolSource = 'outreach_engine' | 'it_clone' | 'custom';

export interface AxonUserTool {
  slug: string;
  defaultDisplayName: string;
  href: string;
  icon: string;
  sourceType: AxonUserToolSource;
}

/** Built-in AXON tools surfaced under sidebar "AXON's Tools". */
export const AXON_USER_TOOLS: AxonUserTool[] = [
  {
    slug: 'ni-outreach',
    defaultDisplayName: 'NI Outreach HQ',
    href: '/tools/ni-outreach',
    icon: '◎',
    sourceType: 'outreach_engine',
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
