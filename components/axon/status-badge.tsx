import type { LeadStatus } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';

const STYLES: Record<string, string> = {
  pending_approval: 'bg-axon-gold/15 text-axon-gold border-axon-gold/30',
  approved: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  sent: 'bg-axon-teal/15 text-axon-teal border-axon-teal/30',
  closed_won: 'bg-axon-success/15 text-axon-success border-axon-success/30',
  dead: 'bg-axon-danger/15 text-axon-danger border-axon-danger/30',
  archived: 'bg-axon-muted/15 text-axon-muted border-axon-muted/30',
  purged: 'bg-axon-elevated text-axon-muted border-axon-border',
  Lead: 'bg-axon-muted/15 text-axon-muted border-axon-muted/30',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const label = STATUS_LABELS[status] || status;
  const style = STYLES[status] || 'bg-axon-elevated text-axon-muted border-axon-border';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
