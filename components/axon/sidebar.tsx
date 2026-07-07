'use client';

import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AxonTestNotificationButtons } from './axon-test-notification-buttons';

const NAV = [
  { href: '/', label: 'AXON', icon: '◈' },
  { href: '/tools/ni-outreach', label: 'Outreach', icon: '◎' },
  { href: '/queue', label: 'Queue', icon: '▣' },
  { href: '/pipeline', label: 'Pipeline', icon: '▤' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

function SignOutButton({ basePath }: { basePath?: string }) {
  async function handleSignOut() {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    window.location.href = basePath ? appPath('/login', basePath) : apiUrl('/login');
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-2 w-full rounded-lg px-3 py-2 text-left text-xs text-axon-muted transition hover:bg-axon-elevated hover:text-axon-text"
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

export function Sidebar({ basePath }: { basePath?: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-axon-border bg-axon-surface">
      <div className="border-b border-axon-border px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-[0.2em] text-axon-blue-glow">AXON</span>
        </div>
        <p className="mt-1 text-xs text-axon-muted">Personalized Agentic Assistant</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
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
              {item.href === '/settings' && (
                <div className="mt-3 border-t border-axon-border/60 pt-3">
                  <AxonTestNotificationButtons />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-axon-border px-4 py-4">
        <a
          href="https://northsideintelligence.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-axon-muted transition hover:bg-axon-elevated hover:text-axon-cyan"
        >
          <span className="text-base opacity-70">⌂</span>
          AXON Home
        </a>
        <SignOutButton basePath={basePath} />
      </div>
    </aside>
  );
}
