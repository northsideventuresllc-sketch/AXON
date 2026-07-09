'use client';

import { apiUrl } from '@/lib/api-base';
import { useAxonQuickLinks } from '@/lib/use-axon-quick-links';
import {
  AXON_USER_TOOLS,
  markToolLaunch,
  readToolDisplayNames,
  resolveToolDisplayName,
} from '@/lib/axon-user-tools';
import { appPath } from '@/lib/paths';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AxonCollapsibleSection } from './axon-collapsible-section';
import { TestModeSidebarPanel } from './test-mode-sidebar-panel';

const EXPLORE_ITS_URL = 'https://www.northsideintelligence.com/toolkit';

const TOP_NAV = [
  { href: '/', label: 'AXON Dash', icon: '◈' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
] as const;

const AXON_HOME_URL = 'https://northsideintelligence.com/axon';

function SignOutButton({ basePath }: { basePath?: string }) {
  async function handleSignOut() {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    window.location.href = basePath ? appPath('/login', basePath) : apiUrl('/login');
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="w-full truncate rounded-lg px-3 py-2 text-left text-[11px] uppercase tracking-[0.1em] text-axon-muted transition hover:bg-axon-elevated hover:text-axon-text"
    >
      Sign out
    </button>
  );
}

function resolveHref(href: string, basePath?: string): string {
  return basePath ? appPath(href, basePath) : href;
}

function isActive(pathname: string, href: string, basePath?: string): boolean {
  const resolved = resolveHref(href, basePath);
  if (href === '/') {
    if (basePath) {
      return pathname === basePath || pathname === `${basePath}/dashboard`;
    }
    return pathname === '/';
  }
  return pathname === resolved || pathname.startsWith(`${resolved}/`);
}

function slugFromItHref(href: string): string | null {
  const m = href.match(/\/tools\/([^/?#]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function Sidebar({ basePath }: { basePath?: string }) {
  const pathname = usePathname();
  const quickLinks = useAxonQuickLinks();
  const [toolNames, setToolNames] = useState<Record<string, string>>({});
  const [testModeOpen, setTestModeOpen] = useState(false);

  useEffect(() => {
    setToolNames(readToolDisplayNames());
    const onUpdate = () => setToolNames(readToolDisplayNames());
    window.addEventListener('axon:tool-names-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('axon:tool-names-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-axon-border bg-axon-surface">
      <div className="shrink-0 border-b border-axon-border px-6 py-5">
        <span className="text-xl font-semibold tracking-[0.2em] text-axon-blue-glow">AXON</span>
        <p className="mt-1 text-xs text-axon-muted">Personalized Agentic Assistant</p>
      </div>

      <nav className="axon-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <div className="space-y-1">
          {TOP_NAV.map((item) => {
            const active = isActive(pathname, item.href, basePath);
            const href = resolveHref(item.href, basePath);
            return (
              <div key={item.href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-axon-blue/15 text-axon-cyan'
                      : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
                  }`}
                >
                  <span className="text-base opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
                {item.href === '/' && (
                  <a
                    href={AXON_HOME_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-axon-muted transition hover:bg-axon-elevated/50 hover:text-axon-text"
                  >
                    <span className="text-base opacity-70">⌂</span>
                    AXON Home
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <AxonCollapsibleSection title="AXON Tools" defaultOpen maxHeightClass="max-h-64">
          {AXON_USER_TOOLS.map((tool) => {
            const href = resolveHref(tool.href, basePath);
            const active = isActive(pathname, tool.href, basePath);
            const label = resolveToolDisplayName(tool, toolNames);

            if (tool.action === 'test-mode-panel') {
              return (
                <button
                  key={tool.slug}
                  type="button"
                  onClick={() => setTestModeOpen(true)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    testModeOpen
                      ? 'bg-axon-blue/15 text-axon-cyan'
                      : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
                  }`}
                >
                  <span className="text-base opacity-70">{tool.icon}</span>
                  <span className="truncate">{label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tool.slug}
                href={href}
                onClick={() => {
                  if (!active) markToolLaunch(tool.slug);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-axon-blue/15 text-axon-cyan'
                    : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
                }`}
              >
                <span className="text-base opacity-70">{tool.icon}</span>
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </AxonCollapsibleSection>

        <AxonCollapsibleSection title="My ITs" defaultOpen maxHeightClass="max-h-52">
          {quickLinks.map((tool) => {
            const slug = slugFromItHref(tool.href);
            const modifyHref = slug
              ? `${resolveHref('/tools/it-builder', basePath)}?slug=${encodeURIComponent(slug)}`
              : null;
            return (
              <div
                key={tool.id ?? `${tool.href}-${tool.label}`}
                className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-axon-elevated/40"
              >
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate py-1.5 pl-1 text-sm text-axon-muted hover:text-axon-text"
                >
                  {tool.label}
                </a>
                {modifyHref && (
                  <Link
                    href={modifyHref}
                    className="shrink-0 rounded border border-axon-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-axon-gold hover:bg-axon-gold/10"
                  >
                    Modify
                  </Link>
                )}
              </div>
            );
          })}
          <a
            href={EXPLORE_ITS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block rounded-lg border border-dashed border-axon-border/80 px-3 py-2 text-center text-xs text-axon-muted transition hover:border-axon-gold/40 hover:text-axon-gold"
          >
            Explore ITs
          </a>
        </AxonCollapsibleSection>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-axon-border px-3 py-3">
        {basePath && (
          <Link
            href="/"
            className="flex w-full items-center gap-2 truncate rounded-lg px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-axon-muted transition hover:bg-axon-elevated hover:text-axon-cyan"
          >
            <span className="shrink-0">←</span>
            <span className="truncate">Back to NI Portal</span>
          </Link>
        )}
        <SignOutButton basePath={basePath} />
      </div>
      <TestModeSidebarPanel open={testModeOpen} onClose={() => setTestModeOpen(false)} />
    </aside>
  );
}
