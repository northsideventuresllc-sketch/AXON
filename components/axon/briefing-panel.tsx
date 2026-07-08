'use client';

import type { BriefingItem } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

interface BriefingPanelProps {
  items: BriefingItem[];
  autonomous: boolean;
  onRefresh: () => void;
  onTitleClick?: () => void;
  compact?: boolean;
  className?: string;
}

const PRIORITY_STYLES = {
  high: 'border border-axon-cyan/40 bg-axon-blue/20 text-axon-cyan',
  medium: 'border border-axon-blue-glow/35 bg-axon-blue/10 text-axon-blue-glow',
  low: 'border border-axon-border bg-axon-elevated/60 text-axon-muted',
};

export function BriefingPanel({ items, autonomous, onRefresh, onTitleClick, compact, className = '' }: BriefingPanelProps) {
  async function dismiss(id: string) {
    await fetch(apiUrl('/api/axon/workspace'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_briefing_id: id }),
    });
    onRefresh();
  }

  return (
    <section className={`axon-card-3d axon-glass axon-holo-side-card flex flex-col rounded-2xl overflow-hidden h-full ${className}`}>
      <header className="border-b border-axon-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onTitleClick}
            className={`text-left text-xs uppercase tracking-[0.2em] text-axon-blue-glow transition hover:text-axon-cyan ${onTitleClick ? 'cursor-pointer hover:underline' : ''}`}
          >
            Briefing
          </button>
          {autonomous && (
            <span className="rounded-full bg-axon-blue/20 px-2 py-0.5 text-[10px] text-axon-cyan animate-pulse-glow">
              Autonomous
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-axon-muted">
          Daily brief includes autonomous research (4x/week) + pipeline priorities
        </p>
      </header>

      <div className={`flex-1 min-h-0 space-y-3 overflow-y-auto p-4 md:p-5 ${compact ? 'max-h-[280px]' : ''}`}>
        {items.length === 0 ? (
          <EmptyState
            icon="◈"
            text="No briefing yet. Try: “Set up my morning briefing with pipeline and priorities.”"
          />
        ) : (
          items.map((item, i) => (
            <article
              key={item.id}
              className="group rounded-xl border border-axon-border/50 bg-axon-elevated/40 p-4 transition hover:border-axon-blue/40"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${PRIORITY_STYLES[item.priority]}`}
                    >
                      {item.priority}
                    </span>
                    {item.source === 'axon' && (
                      <span className="text-[9px] text-axon-muted">AXON</span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-sm font-medium text-axon-text">{item.title}</h3>
                  {item.content && (
                    <p className="mt-1 text-xs leading-relaxed text-axon-muted line-clamp-3">
                      {item.content}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 rounded p-1 text-axon-muted opacity-0 transition hover:bg-axon-border/50 hover:text-axon-text group-hover:opacity-100"
                  aria-label="Dismiss briefing item"
                >
                  ×
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="text-2xl text-axon-blue/50 animate-float">{icon}</span>
      <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-axon-muted">{text}</p>
    </div>
  );
}
