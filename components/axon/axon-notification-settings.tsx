'use client';

import { useState } from 'react';
import type { NotificationSettings } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

interface AxonNotificationSettingsProps {
  initial: NotificationSettings;
}

export function AxonNotificationSettings({ initial }: AxonNotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [customRule, setCustomRule] = useState('');

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(data.preferences.notifications);
      setMessage('Notification settings saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function patch(partial: Partial<NotificationSettings>) {
    setSettings((s) => ({ ...s, ...partial }));
  }

  function addCustomNotUrgent() {
    if (!customRule.trim()) return;
    setSettings((s) => ({
      ...s,
      customNotUrgent: [...s.customNotUrgent, customRule.trim()],
    }));
    setCustomRule('');
  }

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
      <h2 className="text-sm font-medium text-axon-blue-glow">Notifications & Urgency</h2>
      <p className="mt-1 text-xs text-axon-muted">
        AXON pre-packages urgency rules. Clarify what is not urgent, or disable urgency entirely.
      </p>

      <div className="mt-6 space-y-4">
        <ToggleRow label="Notifications enabled" checked={settings.enabled} onChange={(v) => patch({ enabled: v })} />
        <ToggleRow
          label="Urgent notifications (flash + alarm)"
          checked={settings.urgencyEnabled}
          onChange={(v) => patch({ urgencyEnabled: v })}
        />
        <ToggleRow
          label="Urgent alarm sound"
          checked={settings.urgencySound}
          onChange={(v) => patch({ urgencySound: v })}
          disabled={!settings.urgencyEnabled}
        />

        <label className="block text-xs text-axon-muted">
          Urgent flash duration ({settings.urgencyFlashSeconds}s)
          <input
            type="range"
            min={3}
            max={5}
            step={1}
            value={settings.urgencyFlashSeconds}
            onChange={(e) => patch({ urgencyFlashSeconds: Number(e.target.value) })}
            className="mt-2 w-full"
            disabled={!settings.urgencyEnabled}
          />
        </label>

        <label className="block text-xs text-axon-muted">
          Alarm volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.urgencyVolume}
            onChange={(e) => patch({ urgencyVolume: Number(e.target.value) })}
            className="mt-2 w-full"
            disabled={!settings.urgencySound}
          />
        </label>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-axon-muted">Integration notifications</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['outreach', 'NI Outreach'],
              ['telegram', 'Telegram'],
              ['pipeline', 'Pipeline'],
              ['hermes', 'Hermes'],
            ] as const
          ).map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={settings.integrations[key]}
              onChange={(v) =>
                patch({ integrations: { ...settings.integrations, [key]: v } })
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-axon-muted">AXON urgency rules (pre-packaged)</p>
        <div className="mt-3 space-y-2">
          {(
            [
              ['pipelineApproval', 'Pipeline items needing approval'],
              ['dealWon', 'Deal won / closed'],
              ['systemError', 'System errors & failures'],
              ['outreachReply', 'Outreach replies (off by default)'],
            ] as const
          ).map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={settings.urgencyRules[key]}
              onChange={(v) =>
                patch({ urgencyRules: { ...settings.urgencyRules, [key]: v } })
              }
              disabled={!settings.urgencyEnabled}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-axon-muted">Never treat as urgent (keywords)</p>
        <div className="mt-2 flex gap-2">
          <input
            value={customRule}
            onChange={(e) => setCustomRule(e.target.value)}
            placeholder="e.g. newsletter, digest"
            className="flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCustomNotUrgent}
            className="rounded-lg border border-axon-border px-3 text-xs hover:border-axon-blue/40"
          >
            Add
          </button>
        </div>
        {settings.customNotUrgent.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {settings.customNotUrgent.map((rule) => (
              <li
                key={rule}
                className="rounded-full bg-axon-elevated px-2 py-0.5 text-[10px] text-axon-muted"
              >
                {rule}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg axon-gradient-btn px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save notification settings'}
        </button>
        {message && <span className="text-xs text-axon-muted">{message}</span>}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between text-xs ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-axon-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-axon-blue' : 'bg-axon-border'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}
