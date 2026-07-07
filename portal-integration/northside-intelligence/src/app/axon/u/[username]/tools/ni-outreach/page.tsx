import Link from 'next/link';
import { LeadCard } from '@/components/axon-ui/lead-card';
import { GoalProgress, PipelineBreakdown, StatsCards } from '@/components/axon-ui/stats-cards';
import { fetchLeads, fetchPipelineStats } from '@/lib/axon/leads';
import { axonPublicPath } from '@/lib/axon/paths';
import { appPath } from '@/lib/axon/app-path';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonNiOutreachPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);
  const [stats, leads] = await Promise.all([fetchPipelineStats(), fetchLeads(50)]);
  const pending = leads.filter((l) => l.status === 'pending_approval');
  const recent = leads.slice(0, 6);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={appPath('/', basePath)}
          className="text-sm text-axon-muted hover:text-axon-gold"
        >
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">Autonomous Task</p>
        <h1 className="mt-1 text-3xl font-semibold">NI Services Outreach</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Phase 1 — find → score → draft → approve → send → close 4 paid clients. No auto-send.
        </p>
      </header>

      <StatsCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <GoalProgress stats={stats} />
        <PipelineBreakdown stats={stats} />
      </div>

      {pending.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Pending Approval
              <span className="ml-2 font-mono text-sm text-axon-gold">({pending.length})</span>
            </h2>
            <Link href={appPath('/queue', basePath)} className="text-sm text-axon-teal hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pending.slice(0, 4).map((lead) => (
              <LeadCard key={lead.id} lead={lead} basePath={basePath} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium">Recent Activity</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {recent.map((lead) => (
            <LeadCard key={lead.id} lead={lead} basePath={basePath} />
          ))}
        </div>
      </section>
    </div>
  );
}
