'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

interface QuickLink {
  id?: string;
  label: string;
  href: string;
}

export function QuickLinksRail({ bare = false }: { bare?: boolean }) {
  const [links, setLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    fetch(apiUrl('/api/axon/quick-links'))
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(() => setLinks([]));
  }, []);

  const inner = (
    <div className="grid gap-1.5 p-3">
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
  );

  if (!links.length) return bare ? <p className="p-3 text-xs text-slate-500">No quick links yet.</p> : null;
  if (bare) return inner;
  return (
    <section className="v0-panel p-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Quick Links</p>
      {inner}
    </section>
  );
}
