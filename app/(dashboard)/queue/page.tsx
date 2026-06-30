import { fetchLeads } from '@/lib/leads';
import { LeadCard } from '@/components/axon/lead-card';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const leads = await fetchLeads();
  const pending = leads.filter((l) => l.status === 'pending_approval');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Approval Queue</h1>
        <p className="mt-1 text-sm text-axon-muted">
          Review AI-drafted outreach. Approve to send (email) or mark for manual LinkedIn DM.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
          <p className="text-axon-muted">No drafts pending approval.</p>
          <p className="mt-2 text-xs text-axon-muted">
            Nightly outreach runs at 2:30 AM EST via GitHub Actions.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pending.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
