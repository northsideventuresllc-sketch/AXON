import type { LeadMeta } from '@/lib/types';

export function IcpFitBadge({ meta }: { meta: LeadMeta }) {
  const scan = meta.icp_scan;
  if (!scan && !meta.auto_rejected) return null;

  if (meta.auto_rejected === 'icp_violation') {
    return (
      <span className="rounded border border-axon-danger/40 bg-axon-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-axon-danger">
        ICP auto
      </span>
    );
  }

  if (scan?.icp_fit === false) {
    return (
      <span className="rounded border border-axon-danger/40 bg-axon-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-axon-danger">
        No fit
      </span>
    );
  }

  const segment = scan?.segment?.toUpperCase();
  if (segment) {
    return (
      <span className="rounded border border-axon-teal/30 bg-axon-teal/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-axon-teal">
        {segment}
      </span>
    );
  }

  return null;
}
