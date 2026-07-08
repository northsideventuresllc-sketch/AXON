'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LeadWithMeta } from '@/lib/types';
import type { OutreachSettings } from '@/lib/outreach-settings';
import { formatSocialAccountSummary } from '@/lib/outreach-settings';
import { apiUrl } from '@/lib/api-base';

export interface SendModalPayload {
  channel: 'email' | 'linkedin';
  subject?: string;
  body?: string;
  message?: string;
  to?: string;
  fromEmailId?: string;
  replyToEmailId?: string;
  fromAccountId?: string;
  includeSignature?: boolean;
  signatureText?: string;
}

interface OutreachSendModalProps {
  lead: LeadWithMeta;
  mode: 'email' | 'linkedin';
  open: boolean;
  onClose: () => void;
  onSent: (message: string) => void;
  approveFirst?: boolean;
}

export function OutreachSendModal({
  lead,
  mode,
  open,
  onClose,
  onSent,
  approveFirst = false,
}: OutreachSendModalProps) {
  const channel = lead.meta.channel || 'email';
  const isEmail = mode === 'email';

  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState(lead.meta.email_subject || '');
  const [body, setBody] = useState(lead.comment_draft || '');
  const [message, setMessage] = useState(lead.dm_draft || '');
  const [to, setTo] = useState(lead.meta.contact_email || '');
  const [fromEmailId, setFromEmailId] = useState<string | undefined>();
  const [replyToEmailId, setReplyToEmailId] = useState<string | undefined>();
  const [fromAccountId, setFromAccountId] = useState<string | undefined>();
  const [includeSignature, setIncludeSignature] = useState(true);
  const [signatureText, setSignatureText] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubject(lead.meta.email_subject || '');
    setBody(lead.comment_draft || '');
    setMessage(lead.dm_draft || '');
    setTo(lead.meta.contact_email || '');
    setError(null);

    fetch(apiUrl('/api/axon/outreach/settings'))
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings as OutreachSettings;
        setSettings(s);
        setSignatureText(s.signature?.text || '');
        const sendDefault = s.emails.find((e) => e.isDefaultSend)?.id;
        const recvDefault = s.emails.find((e) => e.isDefaultReceive)?.id;
        const socialDefault = s.socialAccounts.find((a) => a.isDefault && a.profileUrl)?.id
          ?? s.socialAccounts.find((a) => a.profileUrl)?.id;
        setFromEmailId(sendDefault);
        setReplyToEmailId(recvDefault);
        setFromAccountId(socialDefault);
      })
      .catch(() => setError('Could not load outreach settings'));
  }, [open, lead]);

  const send = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (approveFirst && lead.status === 'pending_approval') {
        const approveRes = await fetch(apiUrl(`/api/leads/${lead.id}/approve`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ send: false }),
        });
        const approveData = await approveRes.json();
        if (!approveRes.ok) throw new Error(approveData.error || 'Approve failed');
      }

      const payload: SendModalPayload = isEmail
        ? {
            channel: 'email',
            subject,
            body,
            to,
            fromEmailId,
            replyToEmailId,
            includeSignature,
            signatureText,
          }
        : {
            channel: 'linkedin',
            message,
            fromAccountId,
          };

      const res = await fetch(apiUrl(`/api/leads/${lead.id}/send`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      onSent(data.message || 'Sent');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  }, [
    approveFirst,
    body,
    fromAccountId,
    fromEmailId,
    includeSignature,
    isEmail,
    lead.id,
    lead.status,
    message,
    onClose,
    onSent,
    replyToEmailId,
    subject,
    signatureText,
    to,
  ]);

  if (!open) return null;

  const sendEmail = settings?.emails.find((e) => e.id === fromEmailId);
  const replyEmail = settings?.emails.find((e) => e.id === replyToEmailId);
  const connectedSocial = settings?.socialAccounts.filter((a) => a.profileUrl) ?? [];
  const socialAccount = connectedSocial.find((a) => a.id === fromAccountId) ?? connectedSocial[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-axon-border bg-axon-surface shadow-2xl"
      >
        <div className="border-b border-axon-border px-6 py-4">
          <h2 className="text-lg font-semibold">
            {approveFirst ? 'Approve & Send' : 'Send'} — {lead.handle}
          </h2>
          <p className="mt-1 text-xs text-axon-muted">
            {isEmail ? 'Email outreach' : 'LinkedIn DM'} · {lead.shortId} · score {lead.meta.score ?? '—'}
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {isEmail ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="From" value={sendEmail?.email || '—'} />
                <InfoRow label="Reply-to" value={replyEmail?.email || '—'} />
              </div>

              {settings && (
                <div className="space-y-3 rounded-lg border border-axon-border/60 bg-axon-elevated/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-axon-muted">Send from</p>
                  <div className="flex flex-wrap gap-2">
                    {settings.emails.map((email) => (
                      <SelectChip
                        key={email.id}
                        active={fromEmailId === email.id}
                        label={email.label}
                        sub={email.email}
                        onClick={() => setFromEmailId(email.id)}
                      />
                    ))}
                  </div>
                  <p className="text-xs uppercase tracking-wider text-axon-muted">Receive replies at</p>
                  <div className="flex flex-wrap gap-2">
                    {settings.emails.map((email) => (
                      <SelectChip
                        key={`reply-${email.id}`}
                        active={replyToEmailId === email.id}
                        label={email.label}
                        sub={email.email}
                        onClick={() => setReplyToEmailId(email.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">To</span>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">Message</span>
                <textarea
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm leading-relaxed"
                />
              </label>

              <div className="rounded-lg border border-axon-border/60 bg-axon-elevated/40 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                  />
                  Include email signature
                </label>
                {includeSignature && (
                  <textarea
                    rows={3}
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
                    placeholder="Signature text"
                  />
                )}
                {includeSignature && settings?.signature.logoDataUrl && (
                  <img
                    src={settings.signature.logoDataUrl}
                    alt="Signature logo"
                    className="max-h-12"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="To (prospect)" value={lead.handle} />
                <InfoRow
                  label="From account"
                  value={socialAccount ? `@${socialAccount.handle}` : '—'}
                  href={socialAccount?.profileUrl}
                />
              </div>

              {settings && connectedSocial.length > 0 ? (
                <div className="space-y-3 rounded-lg border border-axon-border/60 bg-axon-elevated/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-axon-muted">Send from connected account</p>
                  <div className="flex flex-wrap gap-2">
                    {connectedSocial.map((account) => (
                      <SelectChip
                        key={account.id}
                        active={fromAccountId === account.id}
                        label={account.label}
                        sub={formatSocialAccountSummary(account)}
                        onClick={() => setFromAccountId(account.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-axon-danger">
                  Connect a social profile under Outreach Channels before sending DMs.
                </p>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs text-axon-muted">DM message</span>
                <textarea
                  rows={10}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm leading-relaxed"
                />
              </label>

              <p className="text-xs text-axon-muted">
                Copy this message into {socialAccount?.platform === 'linkedin' ? 'LinkedIn' : 'your connected platform'}{' '}
                {socialAccount?.profileUrl ? (
                  <>
                    from{' '}
                    <a
                      href={socialAccount.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-axon-teal hover:underline"
                    >
                      your profile
                    </a>
                  </>
                ) : null}{' '}
                after confirming. AXON logs the final text for tone learning.
              </p>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-axon-danger/40 bg-axon-danger/10 px-3 py-2 text-sm text-axon-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-axon-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-axon-border px-4 py-2 text-sm hover:bg-axon-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={loading || (!isEmail && connectedSocial.length === 0)}
            className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-4 py-2 text-sm font-medium text-axon-gold hover:bg-axon-gold/20 disabled:opacity-50"
          >
            {loading ? 'Sending…' : approveFirst ? 'Approve & Send' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-lg border border-axon-border/50 bg-axon-elevated/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-axon-muted">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-sm text-axon-teal hover:underline">
          {value}
        </a>
      ) : (
        <p className="mt-0.5 truncate text-sm">{value}</p>
      )}
    </div>
  );
}

function SelectChip({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
        active
          ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="mt-0.5 block truncate text-[10px] opacity-80">{sub}</span>
    </button>
  );
}
