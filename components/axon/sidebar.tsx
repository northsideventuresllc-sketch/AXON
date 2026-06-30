'use client';

import { apiUrl } from '@/lib/api-base';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'AXON', icon: '◈' },
  { href: '/tools/ni-outreach', label: 'Outreach', icon: '◎' },
  { href: '/queue', label: 'Queue', icon: '▣' },
  { href: '/pipeline', label: 'Pipeline', icon: '▤' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

function SignOutButton() {
  async function handleSignOut() {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    window.location.href = apiUrl('/login');
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-axon-border bg-axon-surface">
      <div className="border-b border-axon-border px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-[0.2em] text-axon-gold">AXON</span>
        </div>
        <p className="mt-1 text-xs text-axon-muted">NORTHSiDE Autonomous Systems</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-axon-elevated text-axon-gold'
                  : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
              }`}
            >
              <span className="text-base opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-axon-border px-4 py-4">
        <SignOutButton />
      </div>
    </aside>
  );
}
