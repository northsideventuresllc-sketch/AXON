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

  async function fireTest(kind: 'normal' | 'urgent' | 'interactive' | 'info') {
    if (busy) return;
    setBusy(true);

    const presets = {
      normal: {
        source: 'NI Outreach',
        title: 'New draft ready for review',
        body: 'A new outreach draft was generated.',
        urgent: false,
        interactive: false,
        links: [{ label: 'Open queue', url: '/tools/ni-outreach' }],
      },
      urgent: {
        source: 'Pipeline Alert',
        title: 'Lead approval required NOW',
        body: 'High-priority lead waiting in queue.',
        urgent: true,
        interactive: false,
      },
      interactive: {
        source: 'AXON Suggestion',
        title: 'Schedule follow-up for warm lead',
        body: 'Acme Corp opened your email 3 times this week.',
        urgent: false,
        interactive: true,
        prompt: 'Would you like me to draft a follow-up sequence for Acme Corp?',
      },
      info: {
        source: 'System',
        title: 'Weekly research digest ready',
        body: 'Your autonomous research run completed with 4 new findings.',
        urgent: false,
        interactive: false,
        links: [
          { label: 'View briefing', url: '/' },
          { label: 'Research log', url: '/tools/research' },
        ],
      },
    } as const;

    const preset = presets[kind];
    const source = preset.source;
    const title = preset.title;

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
          readAutoArchiveHours: 24,
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
        body: preset.body,
        links: 'links' in preset ? preset.links : undefined,
        urgent:
          preset.urgent &&
          settings.urgencyEnabled &&
          (classifyUrgency(source, title, settings) || preset.urgent),
        read: false,
        interactive: preset.interactive,
        prompt: 'prompt' in preset ? preset.prompt : undefined,
        created_at: new Date().toISOString(),
      };

      await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addNotification: {
            source: notification.source,
            title: notification.title,
            body: notification.body,
            links: notification.links,
            urgent: notification.urgent,
            interactive: notification.interactive,
            prompt: notification.prompt,
          },
        }),
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
        onClick={() => fireTest('normal')}
        className="rounded-lg border border-axon-border/60 bg-axon-elevated/80 px-3 py-2 text-[11px] leading-snug text-axon-muted transition hover:border-axon-blue/40 hover:text-axon-cyan disabled:opacity-50"
      >
        NORMAL NOTIFICATION
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fireTest('info')}
        className="rounded-lg border border-axon-border/60 bg-axon-elevated/80 px-3 py-2 text-[11px] leading-snug text-axon-muted transition hover:border-axon-blue/40 hover:text-axon-cyan disabled:opacity-50"
      >
        INFO + LINKS
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fireTest('interactive')}
        className="rounded-lg border border-axon-blue/30 bg-axon-blue/10 px-3 py-2 text-[11px] leading-snug text-axon-cyan transition hover:border-axon-cyan/50 disabled:opacity-50"
      >
        INTERACTIVE NOTIFICATION
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => fireTest('urgent')}
        className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-[11px] leading-snug text-red-300 transition hover:border-red-400/50 disabled:opacity-50"
      >
        URGENT NOTIFICATION
      </button>
    </div>
  );
}
