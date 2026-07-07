'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LeadWithMeta } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';
import { StatusBadge } from './status-badge';

async function postAction(url: string) {
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Action failed');
  return data;
}

export function LeadActions({ lead }: { lead: LeadWithMeta }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const channel = lead.meta.channel || 'email';

  async function run(action: string, url: string) {
    setLoading(action);
    setMessage(null);
    try {
      const data = await postAction(url);
      setMessage(data.message);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(null);
    }
  }

  const canApprove = lead.status === 'pending_approval';
  const canReject = ['pending_approval', 'approved'].includes(lead.status);
  const canSentLi = channel === 'linkedin' && ['approved', 'pending_approval'].includes(lead.status);
  const canMarkWon = ['sent', 'approved'].includes(lead.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <ActionButton
            label={channel === 'email' ? 'Approve & Send Email' : 'Approve (LinkedIn)'}
            loading={loading === 'approve'}
            variant="primary"
            onClick={() => run('approve', apiUrl(`/api/leads/${lead.id}/approve`))}
          />
        )}
        {canSentLi && (
          <ActionButton
            label="Mark LinkedIn Sent"
            loading={loading === 'sent-li'}
            onClick={() => run('sent-li', apiUrl(`/api/leads/${lead.id}/sent-li`))}
          />
        )}
        {canMarkWon && (
          <ActionButton
            label="Mark Closed Won"
            loading={loading === 'won'}
            variant="success"
            onClick={() => run('won', apiUrl(`/api/leads/${lead.id}/won`))}
          />
        )}
        {canReject && (
          <ActionButton
            label="Reject"
            loading={loading === 'reject'}
            variant="danger"
            onClick={() => run('reject', apiUrl(`/api/leads/${lead.id}/reject`))}
          />
        )}
      </div>

      {message && (
        <p className="rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm text-axon-text">
          {message}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  loading,
  variant = 'default',
  onClick,
}: {
  label: string;
  loading: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'success';
  onClick: () => void;
}) {
  const styles = {
    default: 'border-axon-border text-axon-text hover:bg-axon-elevated',
    primary: 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold hover:bg-axon-gold/20',
    danger: 'border-axon-danger/50 text-axon-danger hover:bg-axon-danger/10',
    success: 'border-axon-success/50 text-axon-success hover:bg-axon-success/10',
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles[variant]}`}
    >
      {loading ? 'Working…' : label}
    </button>
  );
}

export function LeadDetailView({ lead }: { lead: LeadWithMeta }) {
  const channel = lead.meta.channel || 'email';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-axon-gold">{lead.shortId}</span>
            <StatusBadge status={lead.status} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{lead.handle}</h1>
          <p className="mt-1 text-sm text-axon-muted">
            {lead.niche} · {lead.target_group?.toUpperCase()} · Score {lead.meta.score ?? '—'}
          </p>
        </div>
      </div>

      <LeadActions lead={lead} />

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoBlock title="Recommended Service" value={lead.meta.recommended_service || '—'} />
        <InfoBlock title="Channel" value={channel} />
        <InfoBlock title="Contact Email" value={lead.meta.contact_email || '—'} />
        <InfoBlock title="Added" value={lead.added || '—'} />
      </div>

      {lead.why_match_fit && (
        <section className="rounded-xl border border-axon-border bg-axon-surface p-5">
          <h2 className="text-xs uppercase tracking-wider text-axon-muted">Fit Rationale</h2>
          <p className="mt-3 text-sm leading-relaxed">{lead.why_match_fit}</p>
        </section>
      )}

      {channel === 'email' && lead.comment_draft && (
        <DraftBlock title="Email Draft" subject={lead.meta.email_subject} body={lead.comment_draft} />
      )}

      {lead.dm_draft && (
        <DraftBlock title={channel === 'linkedin' ? 'LinkedIn DM' : 'LinkedIn Fallback'} body={lead.dm_draft} />
      )}

      {lead.meta.source_link && (
        <section className="rounded-xl border border-axon-border bg-axon-surface p-5">
          <h2 className="text-xs uppercase tracking-wider text-axon-muted">Source</h2>
          <a
            href={lead.meta.source_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block truncate text-sm text-axon-teal hover:underline"
          >
            {lead.meta.serp_title || lead.meta.source_link}
          </a>
        </section>
      )}
    </div>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-4">
      <p className="text-xs uppercase tracking-wider text-axon-muted">{title}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function DraftBlock({ title, subject, body }: { title: string; subject?: string | null; body: string }) {
  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-5">
      <h2 className="text-xs uppercase tracking-wider text-axon-muted">{title}</h2>
      {subject && <p className="mt-3 text-sm font-medium">Subject: {subject}</p>}
      <pre className="mt-3 whitespace-pre-wrap font-[family-name:var(--font-display)] text-sm leading-relaxed text-axon-text/90">
        {body}
      </pre>
    </section>
  );
}
