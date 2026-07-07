import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchLeadById } from '@/lib/leads';
import { LeadDetailView } from '@/components/axon/lead-detail';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await fetchLeadById(id);
  if (!lead) notFound();

  return (
    <div className="space-y-6">
      <Link href="/tools/ni-outreach?tab=pipeline" className="text-sm text-axon-muted hover:text-axon-gold">
        ← Back to pipeline
      </Link>
      <LeadDetailView lead={lead} />
    </div>
  );
}
