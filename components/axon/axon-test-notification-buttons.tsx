'use client';

import { useState } from 'react';
import { classifyUrgency } from '@/lib/axon-preferences';
import type { AxonNotification, NotificationSettings } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

interface AxonTestNotificationButtonsProps {
  className?: string;
}

export function AxonTestNotificationButtons({ className = '' }: AxonTestNotificationButtonsProps) {
  const [busy, setBusy] = useState(false);

  async function fireTest(urgent: boolean) {
    if (busy) return;
    setBusy(true);

    const source = urgent ? 'Pipeline Alert' : 'NI Outreach';
    const title = urgent ? 'Lead approval required NOW' : 'New draft ready for review';

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
        id: `test-${Date.now()}`,
        source,
        title,
        body: urgent ? 'High-priority lead waiting in queue.' : 'A new outreach draft was generated.',
        urgent:
          urgent &&
          settings.urgencyEnabled &&
          (classifyUrgency(source, title, settings) || urgent),
        read: false,
        created_at: new Date().toISOString(),
      };

      await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addNotification: notification }),
      }).then(async (res) => {
        if (!res.ok) {
          window.dispatchEvent(
            new CustomEvent('axon:test-notification', { detail: { notification } })
          );
          return;
        }
        const data = await res.json();
        const saved = data.preferences?.notificationsInbox?.[0] ?? notification;
        window.dispatchEvent(
          new CustomEvent('axon:test-notification', { detail: { notification: saved } })
        );
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <p className="px-1 text-[10px] uppercase tracking-[0.15em] text-axon-muted/80">Test alerts</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => fireTest(false)}
        className="rounded-lg border border-axon-border/60 bg-axon-elevated/80 px-3 py-2 text-[11px] leading-snug text-axon-muted transition hover:border-axon-blue/40 hover:text-axon-cyan disabled:opacity-50"
      >
        Normal notification
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fireTest(true)}
        className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-[11px] leading-snug text-red-300 transition hover:border-red-400/50 disabled:opacity-50"
      >
        Urgent notification
      </button>
    </div>
  );
}
