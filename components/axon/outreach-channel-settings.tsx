'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  OutreachEmailAccount,
  OutreachSettings,
  OutreachSocialAccount,
  SocialPlatform,
} from '@/lib/outreach-settings';
import {
  formatSocialAccountSummary,
  newEmailAccount,
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
    id: 'reddit',
    label: 'Reddit',
    placeholder: 'https://www.reddit.com/user/your-profile',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'https://www.instagram.com/your-profile',
  },
  {
    id: 'custom',
    label: 'Other',
    placeholder: 'https://your-network.com/your-profile',
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
  const [newSocialCustomName, setNewSocialCustomName] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [blockedDeleteNotice, setBlockedDeleteNotice] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  /** One email as both send-from and reply-to (clears both roles on other accounts). */
  function setBothDefaults(id: string) {
    if (!settings) return;
    save({
      ...settings,
      emails: settings.emails.map((e) => ({
        ...e,
        isDefaultSend: e.id === id,
        isDefaultReceive: e.id === id,
      })),
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
    if (!settings || !newEmail.trim()) return;
    const account = newEmailAccount({ email: newEmail.trim(), label: newEmailLabel.trim() || newEmail.trim() });
    save({ ...settings, emails: [...settings.emails, account] });
    setNewEmail('');
    setNewEmailLabel('');
  }

  function connectSocial() {
    if (!settings) return;
    setConnectError(null);
    const parsed = parseSocialProfileUrl(
      newSocialUrl,
      newSocialPlatform,
      newSocialPlatform === 'custom' ? newSocialCustomName : undefined,
    );
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
      <section className="rounded-xl border border-axon-border bg-axon-surface p-5 space-y-6">
      <div>
        <h2 className="text-lg font-medium">Outreach Channels</h2>
        <p className="mt-1 text-sm text-axon-muted">
          Configure emails AXON can send from and receive replies at. Connect social accounts by pasting
          your profile or page URL — AXON does not guess usernames.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-axon-muted">Email list</h3>
        {settings.emails.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            onDefaultSend={() => setDefaultSend(email.id)}
            onDefaultReceive={() => setDefaultReceive(email.id)}
            onBoth={() => setBothDefaults(email.id)}
            onRemove={() => removeEmail(email.id)}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="email@domain.com or Name <email@domain.com>"
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
            className="rounded-lg border border-axon-border px-3 py-2 text-sm hover:bg-axon-elevated"
          >
            Add email
          </button>
        </div>
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
          {newSocialPlatform === 'custom' && (
            <input
              type="text"
              placeholder="Network name (e.g. TikTok, YouTube)"
              value={newSocialCustomName}
              onChange={(e) => setNewSocialCustomName(e.target.value)}
              className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
            />
          )}
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
  onBoth,
  onRemove,
}: {
  email: OutreachEmailAccount;
  onDefaultSend: () => void;
  onDefaultReceive: () => void;
  onBoth: () => void;
  onRemove: () => void;
}) {
  const isBoth = email.isDefaultSend && email.isDefaultReceive;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-axon-border/60 bg-axon-elevated/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{email.label}</p>
        <p className="truncate text-xs text-axon-muted">{email.email}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectBtn active={email.isDefaultSend} label="Send from" onClick={onDefaultSend} />
        <SelectBtn active={email.isDefaultReceive} label="Reply to" onClick={onDefaultReceive} />
        <SelectBtn active={isBoth} label="Both" onClick={onBoth} />
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
