'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { AxonToolFooter } from './axon-tool-footer';
import { appPath } from '@/lib/paths';

type DealLead = {
  id: string;
  handle: string;
  status: string;
  niche: string | null;
  notes: string | null;
  created_at: string;
};

const DEAL_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  closed_won: {
    label: 'Won',
    color: 'text-axon-teal',
    bg: 'bg-axon-teal/10',
    border: 'border-axon-teal/30',
  },
  sent: {
    label: 'Negotiating',
    color: 'text-axon-gold',
    bg: 'bg-axon-gold/10',
    border: 'border-axon-gold/30',
  },
};

export function DealTrackerTool({ basePath }: { basePath?: string }) {
  const [leads, setLeads] = useState<DealLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeHref = basePath ? appPath('/', basePath) : '/';

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/axon/deals'));
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setLeads(data.leads || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const won = leads.filter((l) => l.status === 'closed_won');
  const negotiating = leads.filter((l) => l.status === 'sent');

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <h1 className="mt-1 text-3xl font-semibold">Deal Tracker</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Proposals, negotiations, and closed-won revenue from the NI-Brain pipeline.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Closed Won" value={won.length} accent="teal" />
        <StatCard label="Negotiating" value={negotiating.length} accent="gold" />
        <StatCard label="Total Active" value={leads.length} accent="muted" />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading && !leads.length ? (
        <p className="text-sm text-axon-muted">Loading deals…</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(DEAL_STATUS_CONFIG).map(([status, cfg]) => {
            const group = leads.filter((l) => l.status === status);
            return (
              <section key={status}>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.color}`}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-xs text-axon-muted">
                    {group.length} deal{group.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {group.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-axon-border p-6 text-center">
                    <p className="text-sm text-axon-muted">
                      No {cfg.label.toLowerCase()} deals.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.map((lead) => (
                      <DealCard key={lead.id} lead={lead} cfg={cfg} basePath={basePath} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {leads.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
              <p className="text-axon-muted">
                No active deals — leads appear here once won or in negotiation.
              </p>
            </div>
          )}
        </div>
      )}
      <AxonToolFooter toolSlug="deal-tracker" basePath={basePath} />
    </div>
  );
}

function DealCard({
  lead,
  cfg,
  basePath,
}: {
  lead: DealLead;
  cfg: { label: string; color: string; bg: string; border: string };
  basePath?: string;
}) {
  const leadHref = basePath ? appPath(`/leads/${lead.id}`, basePath) : `/leads/${lead.id}`;
  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={leadHref} className="block truncate text-base font-medium hover:text-axon-gold">
            {lead.handle}
          </Link>
          {lead.niche && <p className="mt-0.5 text-xs text-axon-muted">{lead.niche}</p>}
          <p className="mt-1 font-mono text-xs text-axon-muted">
            Added {new Date(lead.created_at).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.color}`}
        >
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'teal' | 'gold' | 'muted';
}) {
  const colorMap = {
    teal: 'text-axon-teal',
    gold: 'text-axon-gold',
    muted: 'text-axon-muted',
  };
  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-4">
      <p className={`text-2xl font-semibold ${colorMap[accent]}`}>{value}</p>
      <p className="mt-1 text-xs text-axon-muted">{label}</p>
    </div>
  );
}
