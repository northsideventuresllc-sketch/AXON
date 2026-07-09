'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { classifyUrgency } from '@/lib/axon-preferences';
import type { AxonNotification, NotificationSettings } from '@/lib/axon-types';

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
      { id: 'normal', label: 'Normal notification', urgent: false, hint: 'Standard inbox entry — no urgency flash.' },
      { id: 'urgent', label: 'Urgent notification', urgent: true, hint: 'Triggers urgency rules + flash if enabled.' },
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    description: 'NI Outreach HQ draft and pipeline signals.',
    tests: [
      { id: 'draft-ready', label: 'Draft ready for review', urgent: false, hint: 'Simulates a new outreach draft awaiting approval.' },
      { id: 'pipeline-approval', label: 'Pipeline approval NOW', urgent: true, hint: 'High-priority lead in queue.' },
    ],
  },
  {
    id: 'dispatch',
    label: 'Repo Manager Dispatch',
    description: 'Hermes dispatch and manager Telegram cues.',
    tests: [
      { id: 'dispatch-fired', label: 'Dispatch batch fired', urgent: false, hint: 'Confirms dispatch notification path.' },
      { id: 'dispatch-blocked', label: 'Dispatch blocked', urgent: true, hint: 'Blocked task needs JB attention.' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Telegram, Hermes, and system health pings.',
    tests: [
      { id: 'telegram-ping', label: 'Telegram relay', urgent: false, hint: 'Tests telegram integration notification.' },
      { id: 'system-error', label: 'System error', urgent: true, hint: 'Simulates workflow failure alert.' },
    ],
  },
];

export function TestModeTool() {
  const [open, setOpen] = useState(true);
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
        };

      const notification: AxonNotification = {
        id: `test-${test.id}-${Date.now()}`,
        source,
        title,
        body: test.hint,
        urgent: test.urgent && settings.urgencyEnabled && classifyUrgency(source, title, settings),
        read: false,
        created_at: new Date().toISOString(),
      };

      const res = await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addNotification: notification }),
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

  return (
    <div className="flex min-h-[480px] gap-0">
      <aside
        className={`shrink-0 border-r border-axon-border bg-axon-surface transition-all ${
          open ? 'w-64' : 'w-10'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between border-b border-axon-border px-3 py-3 text-xs uppercase tracking-wider text-axon-muted hover:text-white"
        >
          {open && <span>Test categories</span>}
          <span>{open ? '◂' : '▸'}</span>
        </button>
        {open && (
          <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2 axon-sidebar-scroll">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  categoryId === cat.id
                    ? 'bg-axon-gold/15 text-axon-gold'
                    : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 p-6">
        <h1 className="text-2xl font-semibold text-white">Test Mode</h1>
        <p className="mt-1 text-sm text-axon-muted">
          Categorized test alerts — pick a category, then fire a scenario. Notifications appear in your AXON inbox.
        </p>

        {!category && (
          <p className="mt-8 text-sm text-axon-muted">Select a category from the side panel.</p>
        )}

        {category && (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium text-white">{category.label}</h2>
              <p className="text-sm text-axon-muted">{category.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {category.tests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  disabled={busy}
                  onClick={() => fireTest(category, test)}
                  className={`rounded-xl border px-4 py-4 text-left transition disabled:opacity-50 ${
                    test.urgent
                      ? 'border-red-500/30 bg-red-950/20 hover:border-red-400/50'
                      : 'border-axon-border bg-axon-elevated/30 hover:border-axon-gold/30'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{test.label}</p>
                  <p className="mt-1 text-xs text-axon-muted">{test.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {lastResult && (
          <p className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
            {lastResult}
          </p>
        )}
      </main>
    </div>
  );
}
