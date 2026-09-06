'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiUrl } from '@/lib/api-base';

// NI Portal lives on its own domain; these open the real portal (exact tool-kit
// path is refined in build 2). In-app links use Next <Link> (basePath auto-added).
const NI_PORTAL_URL = 'https://northsideintelligence.com';
const NI_TOOLS_URL = 'https://northsideintelligence.com/tools';

// THE FACE is deliberately absent: it is the home screen, so the logo below is how you
// reach it (JB, 2026-09-06 — "The Face shouldn't be a tab"). /face redirects to /.
const NAV: Array<{ href: string; label: string; external?: boolean }> = [
  { href: '/brain', label: 'Brain' },
  { href: '/agents', label: 'Agents' },
  { href: '/skills', label: 'Skills & MCP' },
  { href: '/toolkit', label: 'AXON Toolkit' },
  { href: '/todo', label: 'To-Do' },
  { href: '/models', label: 'Settings' },
  { href: NI_PORTAL_URL, label: 'NI Portal', external: true },
  { href: NI_TOOLS_URL, label: 'Intelligence Tools', external: true },
  { href: '/legacy', label: 'Legacy' },
];

export function TopNav() {
  const pathname = usePathname();

  async function logout() {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    } catch {
      /* ignore */
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.assign(`${base}/login`);
  }

  return (
    <nav className="v0-topnav sticky top-0 z-30 px-3 py-1.5">
      {/* The home link is THE FACE. It carries the active state no nav entry does now. */}
      <Link
        href="/"
        data-active={pathname === '/'}
        aria-current={pathname === '/' ? 'page' : undefined}
        className="v0-homelink flex items-center gap-2 pr-3"
        aria-label="AXON home"
      >
        <span className="v0-logomark" />
        <span className="hidden text-[10px] tracking-[0.28em] text-cyan-300/80 sm:inline">
          Northside Intelligence
        </span>
      </Link>

      <div className="v0-scroll flex flex-1 items-center gap-0.5 overflow-x-auto">
        {NAV.map((item) =>
          item.external ? (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="v0-navlink"
            >
              {item.label} ↗
            </a>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              data-active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              className="v0-navlink"
            >
              {item.label}
            </Link>
          )
        )}
      </div>

      <button onClick={logout} className="v0-navlink text-rose-300/80 hover:text-rose-200">
        Log Out
      </button>
    </nav>
  );
}
