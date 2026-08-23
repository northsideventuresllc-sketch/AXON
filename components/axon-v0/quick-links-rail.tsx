'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

interface QuickLink {
  id?: string;
  label: string;
  href: string;
}

export function QuickLinksRail() {
  const [links, setLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    fetch(apiUrl('/api/axon/quick-links'))
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(() => setLinks([]));
  }, []);

  if (!links.length) return null;
  return (
    <section className="v0-panel p-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Quick Links</p>
      <div className="mt-2 grid gap-1.5">
        {links.map((l, i) => (
          <a
            key={l.id || i}
            href={l.href}
            target={l.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            className="truncate text-sm text-slate-300 transition hover:text-cyan-200"
          >
            ↗ {l.label}
          </a>
        ))}
      </div>
    </section>
  );
}
