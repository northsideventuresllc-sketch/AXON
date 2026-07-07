'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AXON_USER_TOOLS,
  markToolLaunch,
  readToolDisplayNames,
  resolveToolDisplayName,
} from '@/lib/axon-user-tools';
import { appPath } from '@/lib/paths';

function isToolActive(pathname: string, href: string, basePath?: string): boolean {
  const resolved = basePath ? appPath(href, basePath) : href;
  return pathname === resolved || pathname.startsWith(`${resolved}/`);
}

export function AxonToolsNav({ basePath }: { basePath?: string }) {
  const pathname = usePathname();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(readToolDisplayNames());
    const onUpdate = () => setNames(readToolDisplayNames());
    window.addEventListener('axon:tool-names-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('axon:tool-names-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  return (
    <div className="mt-4 border-t border-axon-border/60 pt-4">
      <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.2em] text-axon-muted">
        AXON&apos;s Tools
      </p>
      <div className="space-y-1">
        {AXON_USER_TOOLS.map((tool) => {
          const href = basePath ? appPath(tool.href, basePath) : tool.href;
          const active = isToolActive(pathname, tool.href, basePath);
          const label = resolveToolDisplayName(tool, names);
          return (
            <Link
              key={tool.slug}
              href={href}
              onClick={() => {
                if (!active) markToolLaunch(tool.slug);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-axon-blue/15 text-axon-cyan'
                  : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
              }`}
            >
              <span className="text-base opacity-70">{tool.icon}</span>
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
