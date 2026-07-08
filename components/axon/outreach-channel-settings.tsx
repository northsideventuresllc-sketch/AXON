'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OutreachEmailAccount, OutreachSettings, OutreachSocialAccount } from '@/lib/outreach-settings';
import { newEmailAccount, newSocialAccount } from '@/lib/outreach-settings';
import { apiUrl } from '@/lib/api-base';

export function OutreachChannelSettings() {
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newEmailLabel, setNewEmailLabel] = useState('');
  const [newSocialHandle, setNewSocialHandle] = useState('');
  const [newSocialLabel, setNewSocialLabel] = useState('');

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

  function addSocial() {
    if (!settings || !newSocialHandle.trim()) return;
    const account = newSocialAccount({
      platform: 'linkedin',
      handle: newSocialHandle.trim(),
      label: newSocialLabel.trim() || 'LinkedIn',
    });
    save({ ...settings, socialAccounts: [...settings.socialAccounts, account] });
    setNewSocialHandle('');
    setNewSocialLabel('');
  }

  function removeEmail(id: string) {
    if (!settings || settings.emails.length <= 1) return;
    save({ ...settings, emails: settings.emails.filter((e) => e.id !== id) });
  }

  function removeSocial(id: string) {
    if (!settings || settings.socialAccounts.length <= 1) return;
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

  if (loading) {
    return <p className="text-sm text-axon-muted">Loading channel settings…</p>;
  }

  if (!settings) return null;

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-5 space-y-6">
      <div>
        <h2 className="text-lg font-medium">Outreach Channels</h2>
        <p className="mt-1 text-sm text-axon-muted">
          Configure emails AXON can send from and receive replies at, plus social accounts for DMs.
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
        <h3 className="text-xs uppercase tracking-wider text-axon-muted">Account list (social)</h3>
        {settings.socialAccounts.map((account) => (
          <SocialRow
            key={account.id}
            account={account}
            onDefault={() => setDefaultSocial(account.id)}
            onRemove={() => removeSocial(account.id)}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="LinkedIn handle / display name"
            value={newSocialHandle}
            onChange={(e) => setNewSocialHandle(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Label"
            value={newSocialLabel}
            onChange={(e) => setNewSocialLabel(e.target.value)}
            className="w-32 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addSocial}
            className="rounded-lg border border-axon-border px-3 py-2 text-sm hover:bg-axon-elevated"
          >
            Add account
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
      <div className="min-w-0">
        <p className="text-sm font-medium">{account.label}</p>
        <p className="truncate text-xs text-axon-muted">
          {account.platform} · {account.handle}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectBtn active={account.isDefault} label="Default" onClick={onDefault} />
        <button type="button" onClick={onRemove} className="text-xs text-axon-danger hover:underline">
          Remove
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
