'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  OutreachEmailAccount,
  OutreachEmailDomain,
  OutreachSettings,
  OutreachSocialAccount,
  SocialPlatform,
} from '@/lib/outreach-settings';
import {
  formatSocialAccountSummary,
  newSocialAccount,
  parseSocialProfileUrl,
} from '@/lib/outreach-settings';
import { apiUrl } from '@/lib/api-base';

const PLATFORM_OPTIONS: { id: SocialPlatform; label: string; placeholder: string }[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'https://www.linkedin.com/in/your-profile',
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    placeholder: 'https://x.com/your-profile',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'https://www.instagram.com/your-profile',
  },
];

export function OutreachChannelSettings() {
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newEmailLabel, setNewEmailLabel] = useState('');
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform>('linkedin');
  const [newSocialUrl, setNewSocialUrl] = useState('');
  const [newSocialLabel, setNewSocialLabel] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [blockedDeleteNotice, setBlockedDeleteNotice] = useState<string | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState<{
    email: string;
    currentDomains: Array<{ name: string; status: string }>;
  } | null>(null);

  async function refreshDomains() {
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/email-domain'));
      const data = await res.json();
      if (res.ok && data.settings) setSettings(data.settings);
    } catch {
      /* best-effort background sync */
    }
  }

  function showBlockedDeleteNotice(kind: 'email' | 'social') {
    setBlockedDeleteNotice(
      kind === 'email' ? 'CAN NOT DELETE DEFAULT EMAIL' : 'CAN NOT DELETE DEFAULT SOCIAL MEDIA'
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/settings'));
      const data = await res.json();
      setSettings(data.settings);
      await refreshDomains();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    const pending = Object.values(settings.emailDomains || {}).some(
      (d) => d.status && !['verified', 'partially_verified'].includes(d.status)
    );
    if (!pending) return;
    const timer = setInterval(refreshDomains, 20000);
    return () => clearInterval(timer);
  }, [settings]);

  async function connectEmail(replaceExisting = false) {
    if (!newEmail.trim()) return;
    setDomainBusy(true);
    setConnectError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/email-domain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), replaceExisting }),
      });
      const data = await res.json();
      if (res.status === 409 && data.canReplace) {
        setReplacePrompt({
          email: newEmail.trim(),
          currentDomains: data.currentDomains || [],
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Connect failed');
      setSettings(data.settings);
      setNewEmail('');
      setNewEmailLabel('');
      setReplacePrompt(null);
      setMessage(
        data.domain?.status === 'verified'
          ? 'Email connected — domain verified. Ready to send.'
          : 'Email connected — add the DNS records below. AXON will keep checking automatically.'
      );
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setDomainBusy(false);
    }
  }

  async function verifyDomain(domain: string) {
    setDomainBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/email-domain'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification check failed');
      setSettings(data.settings);
      setMessage(
        data.domain?.status === 'verified'
          ? `${domain} is verified — you can send outreach email.`
          : `Verification check queued for ${domain}. DNS can take up to 15 minutes.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setDomainBusy(false);
    }
  }

  async function save(next: OutreachSettings) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSettings(data.settings);
      setMessage('Settings saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function setDefaultSend(id: string) {
    if (!settings) return;
    save({
      ...settings,
      emails: settings.emails.map((e) => ({ ...e, isDefaultSend: e.id === id })),
    });
  }

  function setDefaultReceive(id: string) {
    if (!settings) return;
    save({
      ...settings,
      emails: settings.emails.map((e) => ({ ...e, isDefaultReceive: e.id === id })),
    });
  }

  function setDefaultSocial(id: string) {
    if (!settings) return;
    save({
      ...settings,
      socialAccounts: settings.socialAccounts.map((a) => ({ ...a, isDefault: a.id === id })),
    });
  }

  function addEmail() {
    connectEmail(false);
  }

  function connectSocial() {
    if (!settings) return;
    setConnectError(null);
    const parsed = parseSocialProfileUrl(newSocialUrl, newSocialPlatform);
    if ('error' in parsed) {
      setConnectError(parsed.error);
      return;
    }
    const account = newSocialAccount(parsed, newSocialLabel.trim() || undefined);
    const isFirst = settings.socialAccounts.filter((a) => a.profileUrl).length === 0;
    save({
      ...settings,
      socialAccounts: [
        ...settings.socialAccounts,
        { ...account, isDefault: isFirst },
      ],
    });
    setNewSocialUrl('');
    setNewSocialLabel('');
    setConnectError(null);
  }

  function removeEmail(id: string) {
    if (!settings) return;
    const email = settings.emails.find((e) => e.id === id);
    if (!email) return;
    if (email.isDefaultSend || email.isDefaultReceive) {
      showBlockedDeleteNotice('email');
      return;
    }
    save({ ...settings, emails: settings.emails.filter((e) => e.id !== id) });
  }

  function removeSocial(id: string) {
    if (!settings) return;
    const account = settings.socialAccounts.find((a) => a.id === id);
    if (!account) return;
    if (account.isDefault) {
      showBlockedDeleteNotice('social');
      return;
    }
    save({ ...settings, socialAccounts: settings.socialAccounts.filter((a) => a.id !== id) });
  }

  function onLogoUpload(file: File | null) {
    if (!settings || !file) return;
    if (!file.type.startsWith('image/png')) {
      setMessage('Logo must be a PNG file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      save({
        ...settings,
        signature: { ...settings.signature, logoDataUrl: String(reader.result) },
      });
    };
    reader.readAsDataURL(file);
  }

  const platformPlaceholder =
    PLATFORM_OPTIONS.find((p) => p.id === newSocialPlatform)?.placeholder ||
    'https://linkedin.com/in/your-profile';

  if (loading) {
    return <p className="text-sm text-axon-muted">Loading channel settings…</p>;
  }

  if (!settings) return null;

  const connectedSocial = settings.socialAccounts.filter((a) => a.profileUrl);

  return (
    <>
      {blockedDeleteNotice && (
        <BlockedDeleteDialog message={blockedDeleteNotice} onClose={() => setBlockedDeleteNotice(null)} />
      )}
      {replacePrompt && (
        <ReplaceDomainDialog
          email={replacePrompt.email}
          currentDomains={replacePrompt.currentDomains}
          busy={domainBusy}
          onCancel={() => setReplacePrompt(null)}
          onConfirm={() => connectEmail(true)}
        />
      )}
      <section className="rounded-xl border border-axon-border bg-axon-surface p-5 space-y-6">
      <div>
        <h2 className="text-lg font-medium">Outreach Channels</h2>
        <p className="mt-1 text-sm text-axon-muted">
          Connect an email and AXON registers your domain with Resend automatically — no Resend
          dashboard visits. Add DNS records at your domain host once; verification syncs in the
          background.
        </p>
      </div>

      {Object.values(settings.emailDomains || {}).map((domain) => (
        <DomainStatusPanel
          key={domain.domain}
          domain={domain}
          busy={domainBusy}
          onVerify={() => verifyDomain(domain.domain)}
        />
      ))}

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-axon-muted">Email list</h3>
        {settings.emails.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            onDefaultSend={() => setDefaultSend(email.id)}
            onDefaultReceive={() => setDefaultReceive(email.id)}
            onRemove={() => removeEmail(email.id)}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="JB <jb@northsideintelligence.com>"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Label"
            value={newEmailLabel}
            onChange={(e) => setNewEmailLabel(e.target.value)}
            className="w-32 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addEmail}
            disabled={domainBusy || !newEmail.trim()}
            className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-3 py-2 text-sm text-axon-gold disabled:opacity-50"
          >
            {domainBusy ? 'Connecting…' : 'Connect email'}
          </button>
        </div>
        {connectError && <p className="text-sm text-axon-danger">{connectError}</p>}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-axon-muted">Connected social accounts</h3>
        {connectedSocial.length === 0 ? (
          <p className="text-sm text-axon-muted">
            No social accounts connected yet. Paste your profile or company page URL below.
          </p>
        ) : (
          connectedSocial.map((account) => (
            <SocialRow
              key={account.id}
              account={account}
              onDefault={() => setDefaultSocial(account.id)}
              onRemove={() => removeSocial(account.id)}
            />
          ))
        )}

        <div className="rounded-lg border border-axon-border/60 bg-axon-elevated/30 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-axon-muted">Connect account</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => setNewSocialPlatform(platform.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  newSocialPlatform === platform.id
                    ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                    : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
                }`}
              >
                {platform.label}
              </button>
            ))}
          </div>
          <input
            type="url"
            placeholder={platformPlaceholder}
            value={newSocialUrl}
            onChange={(e) => {
              setNewSocialUrl(e.target.value);
              setConnectError(null);
            }}
            className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Optional label"
            value={newSocialLabel}
            onChange={(e) => setNewSocialLabel(e.target.value)}
            className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          {connectError && <p className="text-sm text-axon-danger">{connectError}</p>}
          <button
            type="button"
            onClick={connectSocial}
            disabled={!newSocialUrl.trim() || saving}
            className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-3 py-2 text-sm text-axon-gold disabled:opacity-50"
          >
            Connect account
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-axon-border/60 pt-4">
        <h3 className="text-xs uppercase tracking-wider text-axon-muted">Email signature</h3>
        <textarea
          rows={3}
          value={settings.signature.text}
          onChange={(e) =>
            setSettings({ ...settings, signature: { ...settings.signature, text: e.target.value } })
          }
          className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-axon-border px-3 py-2 text-sm hover:bg-axon-elevated">
            Upload logo (PNG)
            <input
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => onLogoUpload(e.target.files?.[0] || null)}
            />
          </label>
          {settings.signature.logoDataUrl && (
            <img src={settings.signature.logoDataUrl} alt="Logo" className="max-h-10" />
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => save(settings)}
            className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-3 py-2 text-sm text-axon-gold"
          >
            Save signature
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-axon-muted">{message}</p>}
    </section>
    </>
  );
}

function DomainStatusPanel({
  domain,
  busy,
  onVerify,
}: {
  domain: OutreachEmailDomain;
  busy: boolean;
  onVerify: () => void;
}) {
  const verified = domain.status === 'verified' || domain.status === 'partially_verified';
  const statusColor = verified
    ? 'text-axon-teal border-axon-teal/40 bg-axon-teal/5'
    : domain.status === 'failed'
      ? 'text-axon-danger border-axon-danger/40 bg-axon-danger/5'
      : 'text-axon-gold border-axon-gold/40 bg-axon-gold/5';

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${statusColor}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{domain.domain}</p>
          <p className="text-xs capitalize opacity-80">
            Resend: {domain.status || 'not_started'}
            {domain.syncedAt ? ` · synced ${new Date(domain.syncedAt).toLocaleString()}` : ''}
          </p>
        </div>
        {!verified && (
          <button
            type="button"
            disabled={busy}
            onClick={onVerify}
            className="rounded-lg border border-current px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Check verification
          </button>
        )}
      </div>
      {domain.error && <p className="text-xs">{domain.error}</p>}
      {!verified && domain.records?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">DNS records (add at your domain host)</p>
          {domain.records.map((record, i) => (
            <div key={`${record.type}-${record.name}-${i}`} className="rounded border border-axon-border/40 bg-axon-elevated/40 p-2 text-xs font-mono">
              <div className="flex flex-wrap gap-2 text-axon-muted">
                <span>{record.type}</span>
                <span>{record.name}</span>
                {record.priority != null && <span>priority {record.priority}</span>}
                <span className="capitalize">{record.status}</span>
              </div>
              <p className="mt-1 break-all text-axon-text">{record.value}</p>
            </div>
          ))}
          <p className="text-xs opacity-70">
            AXON polls Resend automatically — you do not need to return to resend.com after adding these.
          </p>
        </div>
      )}
      {verified && (
        <p className="text-xs">Domain verified — outreach email can send from any address @{domain.domain}.</p>
      )}
    </div>
  );
}

function ReplaceDomainDialog({
  email,
  currentDomains,
  busy,
  onCancel,
  onConfirm,
}: {
  email: string;
  currentDomains: Array<{ name: string; status: string }>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-axon-gold/40 bg-axon-surface p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-axon-gold">Replace Resend sending domain?</h3>
        <p className="mt-2 text-sm text-axon-muted">
          Your Resend plan allows one domain. Connecting <strong>{email}</strong> will remove{' '}
          {currentDomains.map((d) => d.name).join(', ')} from Resend.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-axon-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-4 py-2 text-sm text-axon-gold disabled:opacity-50"
          >
            {busy ? 'Replacing…' : 'Replace & connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockedDeleteDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="blocked-delete-title"
        className="w-full max-w-md rounded-2xl border border-axon-danger/40 bg-axon-surface p-6 shadow-2xl"
      >
        <h3 id="blocked-delete-title" className="text-lg font-semibold text-axon-danger">
          {message}
        </h3>
        <p className="mt-2 text-sm text-axon-muted">
          Set another account as default before removing this one.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-axon-border px-4 py-2 text-sm hover:bg-axon-elevated"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailRow({
  email,
  onDefaultSend,
  onDefaultReceive,
  onRemove,
}: {
  email: OutreachEmailAccount;
  onDefaultSend: () => void;
  onDefaultReceive: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-axon-border/60 bg-axon-elevated/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{email.label}</p>
        <p className="truncate text-xs text-axon-muted">{email.email}</p>
        {email.domainStatus && (
          <p className={`text-[10px] capitalize ${email.domainStatus === 'verified' ? 'text-axon-teal' : 'text-axon-gold'}`}>
            {email.domain} · {email.domainStatus}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectBtn active={email.isDefaultSend} label="Send" onClick={onDefaultSend} />
        <SelectBtn active={email.isDefaultReceive} label="Receive" onClick={onDefaultReceive} />
        <button type="button" onClick={onRemove} className="text-xs text-axon-danger hover:underline">
          Remove
        </button>
      </div>
    </div>
  );
}

function SocialRow({
  account,
  onDefault,
  onRemove,
}: {
  account: OutreachSocialAccount;
  onDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-axon-border/60 bg-axon-elevated/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{account.label}</p>
        <a
          href={account.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-xs text-axon-teal hover:underline"
        >
          {formatSocialAccountSummary(account)}
        </a>
        <p className="mt-0.5 text-[10px] text-axon-muted">
          {account.platform} · @{account.handle}
          {account.connectedAt ? ` · connected ${new Date(account.connectedAt).toLocaleDateString()}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectBtn active={account.isDefault} label="Default" onClick={onDefault} />
        <button type="button" onClick={onRemove} className="text-xs text-axon-danger hover:underline">
          Disconnect
        </button>
      </div>
    </div>
  );
}

function SelectBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs ${
        active
          ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
      }`}
    >
      {label}
    </button>
  );
}
