import Link from 'next/link';
import { LeadRow } from '@/components/axon-ui/lead-card';
import { fetchLeads } from '@/lib/axon/leads';
import { axonPublicPath } from '@/lib/axon/paths';
import { appPath } from '@/lib/axon/app-path';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import { STATUS_ORDER } from '@/lib/axon/types';

export const dynamic = 'force-dynamic';

export default async function AxonPipelinePage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { status?: string };
}) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);
  const { status: filter } = searchParams;
  const leads = await fetchLeads();
  const filtered = filter ? leads.filter((l) => l.status === filter) : leads;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="mt-1 text-sm text-axon-muted">All AXON NI Services leads from NI-Brain.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterPill
          href={appPath('/pipeline', basePath)}
          label="All"
          active={!filter}
          count={leads.length}
        />
        {STATUS_ORDER.map((status) => {
          const count = leads.filter((l) => l.status === status).length;
          if (count === 0) return null;
          return (
            <FilterPill
              key={status}
              href={`${appPath('/pipeline', basePath)}?status=${status}`}
              label={status.replace(/_/g, ' ')}
              active={filter === status}
              count={count}
            />
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-axon-border bg-axon-surface">
        <div className="grid grid-cols-[100px_1fr_120px_100px_100px] gap-4 border-b border-axon-border bg-axon-elevated px-4 py-2 text-xs uppercase tracking-wider text-axon-muted">
          <span>ID</span>
          <span>Company</span>
          <span>Channel</span>
          <span>Score</span>
          <span>Status</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-axon-muted">No leads match this filter.</p>
        ) : (
          filtered.map((lead) => <LeadRow key={lead.id} lead={lead} basePath={basePath} />)
        )}
      </div>
    </div>
  );
}

function FilterPill({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
        active
          ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
      }`}
    >
      {label} ({count})
    </Link>
  );
}
