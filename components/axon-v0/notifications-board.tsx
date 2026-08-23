'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

interface Note {
  id: string;
  title: string;
  body?: string;
  category?: string;
  created_at: string;
}

export function NotificationsBoard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [mode, setMode] = useState<'recent' | 'venture'>('recent');

  useEffect(() => {
    fetch(apiUrl('/api/axon-v0/notifications'))
      .then((r) => r.json())
      .then((d) => setNotes(d.notifications || []))
      .catch(() => setNotes([]));
  }, []);

  const grouped =
    mode === 'venture'
      ? Object.entries(
          notes.reduce<Record<string, Note[]>>((acc, n) => {
            const k = n.category || 'General';
            (acc[k] ||= []).push(n);
            return acc;
          }, {})
        )
      : ([['Most recent', notes]] as Array<[string, Note[]]>);

  return (
    <section className="v0-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Notifications</p>
        <div className="flex gap-1.5">
          {(['recent', 'venture'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`v0-chip ${mode === m ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
            >
              {m === 'recent' ? 'Most recent' : 'By venture'}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        {notes.length === 0 && <p className="text-xs text-slate-500">All quiet.</p>}
        {grouped.map(([group, list]) => (
          <div key={group}>
            {mode === 'venture' && (
              <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{group}</p>
            )}
            {list.slice(0, 12).map((n) => (
              <div key={n.id} className="mb-2 rounded-lg border border-cyan-400/10 bg-black/30 px-3 py-2">
                <p className="text-xs text-slate-200">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{n.body}</p>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
