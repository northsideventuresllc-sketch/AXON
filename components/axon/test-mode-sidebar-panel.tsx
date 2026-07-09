'use client';

import { useCallback, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { classifyUrgency } from '@/lib/axon-preferences';
import type { AxonNotification, NotificationSettings } from '@/lib/axon-types';
import { formatAxonButton, formatAxonDescription, formatAxonTitle } from '@/lib/axon-copy';

type TestCategory = {
  id: string;
  label: string;
  description: string;
  tests: { id: string; label: string; urgent: boolean; hint: string }[];
};

const CATEGORIES: TestCategory[] = [
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Alert delivery, urgency flash, and inbox routing.',
    tests: [
      { id: 'normal', label: 'Normal Notification', urgent: false, hint: 'Standard inbox entry — no urgency flash.' },
      { id: 'urgent', label: 'Urgent Notification', urgent: true, hint: 'Triggers urgency rules + flash if enabled.' },
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    description: 'NI Outreach HQ draft and pipeline signals.',
    tests: [
      { id: 'draft-ready', label: 'Draft Ready for Review', urgent: false, hint: 'Simulates a new outreach draft awaiting approval.' },
      { id: 'pipeline-approval', label: 'Pipeline Approval NOW', urgent: true, hint: 'High-priority lead in queue.' },
    ],
  },
  {
    id: 'dispatch',
    label: 'Repo Manager Dispatch',
    description: 'Hermes dispatch and manager Telegram cues.',
    tests: [
      { id: 'dispatch-fired', label: 'Dispatch Batch Fired', urgent: false, hint: 'Confirms dispatch notification path.' },
      { id: 'dispatch-blocked', label: 'Dispatch Blocked', urgent: true, hint: 'Blocked task needs JB attention.' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Telegram, Hermes, and system health pings.',
    tests: [
      { id: 'telegram-ping', label: 'Telegram Relay', urgent: false, hint: 'Tests telegram integration notification.' },
      { id: 'system-error', label: 'System Error', urgent: true, hint: 'Simulates workflow failure alert.' },
    ],
  },
];

export function TestModeSidebarPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === categoryId) ?? null,
    [categoryId],
  );

  const fireTest = useCallback(async (cat: TestCategory, test: TestCategory['tests'][0]) => {
    if (busy) return;
    setBusy(true);
    setLastResult(null);
    const source =
      cat.id === 'outreach' ? 'NI Outreach' : cat.id === 'dispatch' ? 'Repo Manager Dispatch' : cat.label;
    const title =
      test.id === 'pipeline-approval'
        ? 'Lead approval required NOW'
        : test.id === 'draft-ready'
          ? 'New draft ready for review'
          : test.label;

    try {
      const prefsRes = await fetch(apiUrl('/api/axon/preferences'));
      const prefsData = prefsRes.ok ? await prefsRes.json() : null;
      const settings: NotificationSettings =
        prefsData?.preferences?.notifications ?? {
          enabled: true,
          urgencyEnabled: true,
          urgencyFlashSeconds: 4,
          urgencySound: true,
          urgencyVolume: 0.35,
          integrations: { outreach: true, telegram: true, pipeline: true, hermes: true },
          urgencyRules: {
            pipelineApproval: true,
            dealWon: true,
            systemError: true,
            outreachReply: false,
          },
          customNotUrgent: [],
          readAutoArchiveHours: 24,
        };

      const notification: AxonNotification = {
        id: `test-${test.id}-${Date.now()}`,
        source,
        title,
        body: test.hint,
        urgent: test.urgent && settings.urgencyEnabled && classifyUrgency(source, title, settings),
        read: false,
        interactive: false,
        created_at: new Date().toISOString(),
      };

      const res = await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addNotification: {
            source: notification.source,
            title: notification.title,
            body: notification.body,
            urgent: notification.urgent,
            interactive: notification.interactive,
          },
        }),
      });

      if (!res.ok) {
        window.dispatchEvent(new CustomEvent('axon:test-notification', { detail: { notification } }));
      } else {
        const data = await res.json();
        const saved = data.preferences?.notificationsInbox?.[0] ?? notification;
        window.dispatchEvent(new CustomEvent('axon:test-notification', { detail: { notification: saved } }));
      }
      setLastResult(`Fired: ${test.label}`);
    } catch (e) {
      setLastResult(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close test mode"
        className="fixed inset-0 z-40 bg-black/40 lg:left-64"
        onClick={onClose}
      />
      <aside
        className="fixed left-64 top-0 z-50 flex h-screen w-80 flex-col border-r border-axon-border bg-axon-surface shadow-2xl"
        role="dialog"
        aria-label="Test Mode"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-axon-border px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-axon-muted">AXON Tool</p>
            <h2 className="text-sm font-semibold text-white">{formatAxonTitle('Test Mode')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-axon-muted hover:bg-axon-elevated hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="axon-sidebar-scroll min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-xs text-axon-muted">
            {formatAxonDescription(
              'Pick a category and fire a test. Alerts appear in your AXON dash so you can see what users experience.',
            )}
          </p>

          <div className="space-y-1 border-b border-axon-border/60 pb-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  categoryId === cat.id
                    ? 'bg-axon-gold/15 text-axon-gold'
                    : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-white'
                }`}
              >
                {formatAxonButton(cat.label)}
              </button>
            ))}
          </div>

          {category && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-axon-muted">{formatAxonDescription(category.description)}</p>
              {category.tests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  disabled={busy}
                  onClick={() => fireTest(category, test)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:opacity-50 ${
                    test.urgent
                      ? 'border-red-500/30 bg-red-950/20 hover:border-red-400/50'
                      : 'border-axon-border bg-axon-elevated/30 hover:border-axon-gold/30'
                  }`}
                >
                  <span className="font-medium text-white">{formatAxonButton(test.label)}</span>
                  <span className="mt-0.5 block text-xs text-axon-muted">{test.hint}</span>
                </button>
              ))}
            </div>
          )}

          {lastResult && (
            <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {lastResult}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
