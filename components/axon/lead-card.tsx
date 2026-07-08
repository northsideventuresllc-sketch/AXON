import Link from 'next/link';
import type { LeadWithMeta } from '@/lib/types';
import { appPath } from '@/lib/paths';
import { StatusBadge } from './status-badge';
import { IcpFitBadge } from './icp-fit-badge';

export function LeadCard({ lead, basePath }: { lead: LeadWithMeta; basePath?: string }) {
  const channel = lead.meta.channel || 'email';
  const score = lead.meta.score;
  const href = basePath ? appPath(`/leads/${lead.id}`, basePath) : `/leads/${lead.id}`;

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-axon-border bg-axon-surface p-5 transition hover:border-axon-gold/40 hover:bg-axon-elevated/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-axon-gold">{lead.shortId}</span>
            {score != null && (
              <span className="rounded bg-axon-elevated px-1.5 py-0.5 font-mono text-xs text-axon-teal">
                {score}
              </span>
            )}
            <IcpFitBadge meta={lead.meta} />
          </div>
          <h3 className="mt-1 truncate text-base font-medium group-hover:text-axon-gold">
            {lead.handle}
          </h3>
          <p className="mt-1 text-xs text-axon-muted">
            {lead.niche} · {lead.target_group?.toUpperCase()} · {channel}
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      {lead.meta.recommended_service && (
        <p className="mt-3 line-clamp-1 text-xs text-axon-muted">
          → {lead.meta.recommended_service}
        </p>
      )}

      {lead.why_match_fit && (
        <p className="mt-2 line-clamp-2 text-sm text-axon-muted/80">{lead.why_match_fit}</p>
      )}
    </Link>
  );
}

export function LeadRow({
  lead,
  basePath,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  lead: LeadWithMeta;
  basePath?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const channel = lead.meta.channel || 'email';
  const href = basePath ? appPath(`/leads/${lead.id}`, basePath) : `/leads/${lead.id}`;

  const gridClass = selectable
    ? 'grid-cols-[40px_100px_1fr_120px_100px_100px]'
    : 'grid-cols-[100px_1fr_120px_100px_100px]';

  const content = (
    <>
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 accent-axon-gold"
        />
      )}
      <span className="font-mono text-xs text-axon-gold">{lead.shortId}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{lead.handle}</p>
          <IcpFitBadge meta={lead.meta} />
        </div>
        <p className="truncate text-xs text-axon-muted">{lead.niche}</p>
      </div>
      <span className="text-xs capitalize text-axon-muted">{channel}</span>
      <span className="font-mono text-xs">{lead.meta.score ?? '—'}</span>
      <StatusBadge status={lead.status} />
    </>
  );

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleSelect}
        onKeyDown={(e) => e.key === 'Enter' && onToggleSelect?.()}
        className={`grid ${gridClass} cursor-pointer items-center gap-4 border-b border-axon-border px-4 py-3 text-sm transition hover:bg-axon-elevated/40 ${
          selected ? 'bg-axon-gold/5' : ''
        }`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`grid ${gridClass} items-center gap-4 border-b border-axon-border px-4 py-3 text-sm transition hover:bg-axon-elevated/40`}
    >
      {content}
    </Link>
  );
}
