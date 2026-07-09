'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { LeadWithMeta } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';

export type FollowUpTab = 'pending' | 'done';

interface FollowUpToolProps {
  pending: LeadWithMeta[];
  done: LeadWithMeta[];
  basePath?: string;
}

export function FollowUpTool({ pending, done, basePath }: FollowUpToolProps) {
  const [tab, setTab] = useState<FollowUpTab>('pending');
  const homeHref = basePath ? appPath('/', basePath) : '/';

  const leads = tab === 'pending' ? pending : done;

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <h1 className="mt-1 text-3xl font-semibold">Follow-Up Engine</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Re-engage sent leads with AI-drafted follow-ups. Draft, copy, and mark sent — all in one
          place.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting Follow-Up" value={pending.length} accent="gold" />
        <StatCard label="Follow-Up Sent" value={done.length} accent="teal" />
        <StatCard label="Total Sent" value={pending.length + done.length} accent="muted" />
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-axon-border/60 pb-3">
        <TabPill
          label="Awaiting Follow-Up"
          count={pending.length}
          active={tab === 'pending'}
          onClick={() => setTab('pending')}
        />
        <TabPill
          label="Follow-Up Done"
          count={done.length}
          active={tab === 'done'}
          onClick={() => setTab('done')}
        />
      </nav>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
          <p className="text-axon-muted">
            {tab === 'pending' ? 'All sent leads have been followed up. 🎯' : 'No follow-ups sent yet.'}
          </p>
          {tab === 'pending' && (
            <p className="mt-2 text-xs text-axon-muted">
              Leads appear here once their status is <span className="font-mono">sent</span>.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <FollowUpCard key={lead.id} lead={lead} done={tab === 'done'} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUpCard({
  lead,
  done,
  basePath,
}: {
  lead: LeadWithMeta;
  done: boolean;
  basePath?: string;
}) {
  const [draft, setDraft] = useState<string | null>(
    (lead.meta.follow_up_draft as string | null) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [markedSent, setMarkedSent] = useState(done);
  const [error, setError] = useState<string | null>(null);

  const leadHref = basePath ? appPath(`/leads/${lead.id}`, basePath) : `/leads/${lead.id}`;

  const draftFollowUp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/axon/follow-up'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Draft failed');
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draft failed');
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  const markSent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/axon/follow-up'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, action: 'mark_sent' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMarkedSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  const copyDraft = useCallback(() => {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [draft]);

  const channel = lead.meta.channel || 'email';
  const sentAt = lead.meta.sent_at as string | null | undefined;
  const followUpSentAt = lead.meta.follow_up_sent_at as string | null | undefined;
  const draftedAt = lead.meta.follow_up_drafted_at as string | null | undefined;

  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-axon-gold">{lead.shortId}</span>
            <ChannelBadge channel={channel} />
            {markedSent && (
              <span className="rounded-full border border-axon-teal/30 bg-axon-teal/10 px-2 py-0.5 text-xs text-axon-teal">
                Follow-up sent
              </span>
            )}
          </div>
          <Link
            href={leadHref}
            className="mt-1 block truncate text-base font-medium hover:text-axon-gold"
          >
            {lead.handle}
          </Link>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-axon-muted">
            {lead.meta.recommended_service && (
              <span>→ {lead.meta.recommended_service as string}</span>
            )}
            {lead.meta.contact_email && (
              <span className="font-mono">{lead.meta.contact_email as string}</span>
            )}
          </div>
          {sentAt && (
            <p className="mt-1 text-xs text-axon-muted">
              Outreach sent{' '}
              <span className="font-mono">{new Date(sentAt).toLocaleDateString()}</span>
            </p>
          )}
          {followUpSentAt && (
            <p className="mt-0.5 text-xs text-axon-teal">
              Follow-up sent{' '}
              <span className="font-mono">{new Date(followUpSentAt).toLocaleDateString()}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={draftFollowUp}
            className="rounded-lg border border-axon-border px-3 py-1.5 text-xs font-medium text-axon-muted transition hover:border-axon-gold/40 hover:text-axon-text disabled:opacity-50"
          >
            {loading ? '...' : draft ? '↻ Regenerate' : '+ Draft Follow-Up'}
          </button>
          {draft && !markedSent && (
            <button
              type="button"
              disabled={loading}
              onClick={markSent}
              className="rounded-lg border border-axon-teal/40 bg-axon-teal/10 px-3 py-1.5 text-xs font-medium text-axon-teal transition hover:bg-axon-teal/20 disabled:opacity-50"
            >
              ✓ Mark Sent
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-t border-axon-border px-5 py-2 text-xs text-axon-danger">{error}</div>
      )}

      {draft && (
        <div className="border-t border-axon-border/60 px-5 pb-5 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-axon-muted">
              Follow-Up Draft
              {draftedAt && (
                <span className="ml-2 normal-case">
                  · generated {new Date(draftedAt).toLocaleDateString()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={copyDraft}
              className="rounded px-2 py-0.5 text-xs text-axon-muted transition hover:text-axon-gold"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 font-mono text-xs leading-relaxed text-axon-text">
            {draft}
          </pre>
        </div>
      )}
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
  accent: 'gold' | 'teal' | 'muted';
}) {
  const colorMap = {
    gold: 'text-axon-gold',
    teal: 'text-axon-teal',
    muted: 'text-axon-muted',
  };
  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-4">
      <p className={`text-2xl font-semibold ${colorMap[accent]}`}>{value}</p>
      <p className="mt-1 text-xs text-axon-muted">{label}</p>
    </div>
  );
}

function TabPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-border text-axon-muted hover:border-axon-gold/30 hover:text-axon-text'
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 font-mono text-axon-teal">({count})</span>
      )}
    </button>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const isLinkedIn = channel === 'linkedin';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${
        isLinkedIn
          ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
          : 'border-axon-border bg-axon-elevated text-axon-muted'
      }`}
    >
      {isLinkedIn ? 'LinkedIn' : 'Email'}
    </span>
  );
}
