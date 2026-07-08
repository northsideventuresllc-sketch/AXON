'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LeadWithMeta } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';
import { StatusBadge } from './status-badge';
import { IcpFitBadge } from './icp-fit-badge';
import { OutreachSendModal } from './outreach-send-modal';

interface DraftState {
  emailSubject: string;
  emailBody: string;
  dmDraft: string;
}

function toDraftState(lead: LeadWithMeta): DraftState {
  return {
    emailSubject: lead.meta.email_subject ?? '',
    emailBody: lead.comment_draft ?? '',
    dmDraft: lead.dm_draft ?? '',
  };
}

async function patchDraft(id: string, patch: Partial<DraftState>) {
  const body: Record<string, string | null> = {};
  if (patch.emailSubject !== undefined) body.email_subject = patch.emailSubject || null;
  if (patch.emailBody !== undefined) body.comment_draft = patch.emailBody || null;
  if (patch.dmDraft !== undefined) body.dm_draft = patch.dmDraft || null;

  const res = await fetch(apiUrl(`/api/axon/outreach/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Save failed');
  return data;
}

async function postAction(url: string, body?: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Action failed');
  return data;
}

type SendModalState = { open: boolean; approveFirst: boolean };

export function LeadActions({ lead }: { lead: LeadWithMeta }) {
  const router = useRouter();
  const channel = lead.meta.channel || 'email';
  const [saved, setSaved] = useState(() => toDraftState(lead));
  const [draft, setDraft] = useState(() => toDraftState(lead));
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [sendModal, setSendModal] = useState<SendModalState>({ open: false, approveFirst: false });

  useEffect(() => {
    const next = toDraftState(lead);
    setSaved(next);
    setDraft(next);
  }, [lead]);

  const dirty = useMemo(
    () =>
      draft.emailSubject !== saved.emailSubject ||
      draft.emailBody !== saved.emailBody ||
      draft.dmDraft !== saved.dmDraft,
    [draft, saved]
  );

  const canEdit = ['pending_approval', 'approved'].includes(lead.status);
  const canApprove = lead.status === 'pending_approval';
  const canSend =
    (lead.status === 'approved' || lead.status === 'pending_approval') &&
    (channel === 'email' ? true : channel === 'linkedin');
  const canReject = ['pending_approval', 'approved'].includes(lead.status);
  const canMarkWon = ['sent', 'approved'].includes(lead.status);

  const run = useCallback(
    async (action: string, fn: () => Promise<{ message?: string }>) => {
      setLoading(action);
      setMessage(null);
      try {
        const data = await fn();
        setMessage(data.message ?? 'Done');
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(null);
      }
    },
    [router]
  );

  async function saveDraft() {
    await run('save', async () => {
      const data = await patchDraft(lead.id, draft);
      const next = toDraftState(data.lead);
      setSaved(next);
      setDraft(next);
      return data;
    });
  }

  function cancelEdits() {
    setDraft(saved);
    setMessage(null);
  }

  function openSendModal(approveFirst: boolean) {
    setSendModal({ open: true, approveFirst });
  }

  const sendMode = channel === 'linkedin' ? 'linkedin' : 'email';

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-4 rounded-xl border border-axon-border bg-axon-surface p-5">
          <h2 className="text-xs uppercase tracking-wider text-axon-muted">Edit draft</h2>

          {channel === 'email' && (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">Email subject</span>
                <input
                  type="text"
                  value={draft.emailSubject}
                  onChange={(e) => setDraft((d) => ({ ...d, emailSubject: e.target.value }))}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm text-axon-text outline-none focus:border-axon-gold/50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">Email body</span>
                <textarea
                  rows={10}
                  value={draft.emailBody}
                  onChange={(e) => setDraft((d) => ({ ...d, emailBody: e.target.value }))}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm leading-relaxed text-axon-text outline-none focus:border-axon-gold/50"
                />
              </label>
            </>
          )}

          {(channel === 'linkedin' || draft.dmDraft || lead.dm_draft) && (
            <label className="block space-y-1.5">
              <span className="text-xs text-axon-muted">
                {channel === 'linkedin' ? 'LinkedIn DM' : 'LinkedIn fallback'}
              </span>
              <textarea
                rows={8}
                value={draft.dmDraft}
                onChange={(e) => setDraft((d) => ({ ...d, dmDraft: e.target.value }))}
                className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm leading-relaxed text-axon-text outline-none focus:border-axon-gold/50"
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2 border-t border-axon-border/60 pt-4">
            <ActionButton
              label="Save Draft"
              loading={loading === 'save'}
              variant="primary"
              disabled={!dirty}
              onClick={saveDraft}
            />
            <ActionButton
              label="Cancel"
              loading={false}
              disabled={!dirty || loading !== null}
              onClick={cancelEdits}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <>
            <ActionButton
              label="Approve"
              loading={loading === 'approve'}
              onClick={() =>
                run('approve', () =>
                  postAction(apiUrl(`/api/leads/${lead.id}/approve`), { send: false })
                )
              }
            />
            {canSend && (
              <ActionButton
                label="Approve & Send"
                loading={loading === 'approve-send'}
                variant="primary"
                onClick={() => openSendModal(true)}
              />
            )}
          </>
        )}
        {lead.status === 'approved' && canSend && (
          <ActionButton
            label={channel === 'linkedin' ? 'Send DM' : 'Send Email'}
            loading={loading === 'send'}
            variant="primary"
            onClick={() => openSendModal(false)}
          />
        )}
        {canMarkWon && (
          <ActionButton
            label="Mark Closed Won"
            loading={loading === 'won'}
            variant="success"
            onClick={() => run('won', () => postAction(apiUrl(`/api/leads/${lead.id}/won`)))}
          />
        )}
        {canReject && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <label className="block space-y-1.5">
              <span className="text-xs text-axon-muted">Reject reason (optional — feeds learn loop)</span>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. wrong ICP, job board, already contacted"
                className="w-full min-w-[240px] rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm text-axon-text outline-none focus:border-axon-danger/50 sm:min-w-[280px]"
              />
            </label>
            <ActionButton
              label="Reject"
              loading={loading === 'reject'}
              variant="danger"
              onClick={() =>
                run('reject', () =>
                  postAction(apiUrl(`/api/leads/${lead.id}/reject`), {
                    reason: rejectReason.trim() || undefined,
                  })
                )
              }
            />
          </div>
        )}
      </div>

      {message && (
        <p className="rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm text-axon-text">
          {message}
        </p>
      )}

      <OutreachSendModal
        lead={lead}
        mode={sendMode}
        open={sendModal.open}
        approveFirst={sendModal.approveFirst}
        onClose={() => setSendModal({ open: false, approveFirst: false })}
        onSent={(msg) => {
          setMessage(msg);
          router.refresh();
        }}
      />
    </div>
  );
}

function ActionButton({
  label,
  loading,
  variant = 'default',
  disabled = false,
  onClick,
}: {
  label: string;
  loading: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'success';
  disabled?: boolean;
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
      disabled={loading || disabled}
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IcpFitBadge meta={lead.meta} />
            {lead.meta.icp_scan?.industry && (
              <span className="text-xs text-axon-muted">{lead.meta.icp_scan.industry}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-axon-muted">
            {lead.niche} · {lead.target_group?.toUpperCase()} · Score {lead.meta.score ?? '—'}
          </p>
        </div>
      </div>

      <LeadActions lead={lead} />

      {(lead.status === 'dead' && (lead.meta.rejected_reason || lead.meta.auto_rejected_reason)) && (
        <section className="rounded-xl border border-axon-danger/30 bg-axon-danger/5 p-5">
          <h2 className="text-xs uppercase tracking-wider text-axon-danger/80">Reject reason</h2>
          <p className="mt-2 text-sm leading-relaxed text-axon-text">
            {lead.meta.rejected_reason || lead.meta.auto_rejected_reason}
          </p>
          {lead.meta.rejected_via && (
            <p className="mt-2 text-xs text-axon-muted">
              via {lead.meta.rejected_via}
              {lead.meta.rejected_at ? ` · ${new Date(lead.meta.rejected_at).toLocaleString()}` : ''}
            </p>
          )}
          <p className="mt-2 text-xs text-axon-muted">
            Rejected leads auto-archive after 72 hours, then purge after 7 days in archive (record kept
            to prevent duplicates).
          </p>
        </section>
      )}

      {lead.status === 'archived' && (
        <section className="rounded-xl border border-axon-border bg-axon-elevated/40 p-5">
          <h2 className="text-xs uppercase tracking-wider text-axon-muted">Archived</h2>
          <p className="mt-2 text-sm text-axon-muted">
            Archived {lead.meta.archived_at ? new Date(lead.meta.archived_at).toLocaleString() : '—'}.
            Permanently removed from pipeline after 7 days; handle stays blocked.
          </p>
        </section>
      )}

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
