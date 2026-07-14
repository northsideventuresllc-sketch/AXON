'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PipelineStats } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';

type StepId = 'find' | 'score' | 'draft' | 'approve' | 'send' | 'follow-up' | 'close';

type StepDef = {
  id: StepId;
  label: string;
  hint: string;
  href: string;
  count: number;
  cta: string;
};

interface LocalModelStatus {
  ollamaAvailable?: boolean;
  provider?: string | null;
  model?: string | null;
  lastRunAt?: string | null;
  lastSummary?: string | null;
  avgScore?: number | null;
  leadsScored?: number | null;
}

interface Phase1WorkflowPanelProps {
  stats: PipelineStats;
  pendingFollowUp?: number;
  basePath?: string;
}

function tabHref(basePath: string | undefined, tab?: string) {
  const base = basePath ? appPath('/tools/ni-outreach', basePath) : '/tools/ni-outreach';
  if (!tab || tab === 'overview') return base;
  return `${base}?tab=${tab}`;
}

export function Phase1WorkflowPanel({
  stats,
  pendingFollowUp = 0,
  basePath,
}: Phase1WorkflowPanelProps) {
  const [active, setActive] = useState<StepId>('find');
  const [model, setModel] = useState<LocalModelStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/axon/local-model'));
      const data = await res.json();
      if (res.ok) setModel(data);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function runLocalScore() {
    setRunning(true);
    setRunMessage(null);
    setActive('score');
    try {
      const res = await fetch(apiUrl('/api/axon/local-model'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Local model run failed');
      setRunMessage(data.summary || 'Local daily model build finished.');
      await loadStatus();
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : 'Local model run failed');
    } finally {
      setRunning(false);
    }
  }

  const steps: StepDef[] = [
    {
      id: 'find',
      label: 'Find',
      hint: 'Trigger ICP discovery inside AXON — not a separate paid scraper.',
      href: tabHref(basePath, 'overview'),
      count: Math.max(0, stats.draftsCap - stats.draftsToday),
      cta: 'Generate leads',
    },
    {
      id: 'score',
      label: 'Score',
      hint: 'Daily local model build (Ollama on Mac; heuristic offline).',
      href: tabHref(basePath, 'overview'),
      count: model?.leadsScored ?? 0,
      cta: running ? 'Scoring…' : 'Run local score',
    },
    {
      id: 'draft',
      label: 'Draft',
      hint: 'AI drafts land in your approval queue — no auto-send.',
      href: tabHref(basePath, 'queue'),
      count: stats.pending,
      cta: 'Open queue',
    },
    {
      id: 'approve',
      label: 'Approve',
      hint: 'JB approves via web or Telegram. NORTHSiDE never auto-sends.',
      href: tabHref(basePath, 'queue'),
      count: stats.pending,
      cta: 'Review drafts',
    },
    {
      id: 'send',
      label: 'Send',
      hint: 'Email via Resend after approve; LinkedIn marked sent manually.',
      href: tabHref(basePath, 'pipeline'),
      count: stats.sent,
      cta: 'View sent',
    },
    {
      id: 'follow-up',
      label: 'Follow-up',
      hint: 'Re-engage sent leads from AXON — keep the loop in-house.',
      href: tabHref(basePath, 'follow-up'),
      count: pendingFollowUp,
      cta: 'Follow-up engine',
    },
    {
      id: 'close',
      label: 'Close',
      hint: `Phase 1 goal: ${stats.closedWon}/${stats.goalTarget} paid NI Services clients.`,
      href: tabHref(basePath, 'pipeline'),
      count: stats.closedWon,
      cta: 'Deal tracker',
    },
  ];

  const current = steps.find((s) => s.id === active) || steps[0];

  return (
    <section className="rounded-xl border border-axon-gold/25 bg-gradient-to-br from-axon-elevated/80 via-axon-surface to-axon-teal/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-axon-gold">Phase 1 workflow</p>
          <h2 className="mt-1 text-lg font-medium text-axon-text">Interactive outreach loop</h2>
          <p className="mt-1 max-w-2xl text-sm text-axon-muted">
            Find → score → draft → approve → send → follow-up → close — all inside AXON so daily
            work does not leak into extra paid tools. Brand: NORTHSiDE.
          </p>
        </div>
        <div className="rounded-lg border border-axon-border/70 bg-axon-elevated/50 px-3 py-2 text-xs">
          <p className="text-axon-muted">Local model</p>
          <p className="mt-0.5 font-mono text-axon-teal">
            {model?.ollamaAvailable ? `Ollama · ${model.model || 'ready'}` : 'Heuristic / offline'}
          </p>
          {model?.lastRunAt && (
            <p className="mt-1 text-[10px] text-axon-muted">
              Last run {new Date(model.lastRunAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <ol className="mt-5 flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const selected = step.id === active;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setActive(step.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                  selected
                    ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                    : 'border-axon-border text-axon-muted hover:border-axon-gold/30 hover:text-axon-text'
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{index + 1}</span>
                <span className="font-medium">{step.label}</span>
                <span className="font-mono text-axon-teal">{step.count}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-axon-border/60 bg-axon-elevated/40 p-4">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-medium text-axon-text">{current.label}</p>
          <p className="mt-1 text-sm text-axon-muted">{current.hint}</p>
          {runMessage && active === 'score' && (
            <p className="mt-2 text-xs text-axon-teal">{runMessage}</p>
          )}
          {model?.lastSummary && active === 'score' && !runMessage && (
            <p className="mt-2 line-clamp-2 text-xs text-axon-muted">{model.lastSummary}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {current.id === 'score' ? (
            <button
              type="button"
              onClick={runLocalScore}
              disabled={running}
              className="rounded-lg border border-axon-teal/40 bg-axon-teal/10 px-4 py-2 text-sm font-medium text-axon-teal transition hover:bg-axon-teal/20 disabled:opacity-50"
            >
              {current.cta}
            </button>
          ) : (
            <Link
              href={current.href}
              className="rounded-lg border border-axon-gold/40 bg-axon-gold/10 px-4 py-2 text-sm font-medium text-axon-gold transition hover:bg-axon-gold/20"
            >
              {current.cta}
            </Link>
          )}
          {current.id !== 'score' && (
            <Link
              href={current.href}
              className="rounded-lg border border-axon-border px-4 py-2 text-sm text-axon-muted transition hover:text-axon-text"
            >
              Jump →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
