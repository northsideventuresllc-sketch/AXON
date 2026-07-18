'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';
import { AxonToolFooter } from './axon-tool-footer';
import { FireModePill, useFireGate } from './fire-gate-banner';

export function FireHoldTool({ basePath }: { basePath?: string }) {
  const { mode, source, blocked, loading, error, refresh } = useFireGate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const homeHref = basePath ? appPath('/', basePath) : '/';

  async function setMode(next: 'FIRE' | 'HOLD') {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(apiUrl('/api/axon/fire-gate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next, confirm: next === 'FIRE' ? true : undefined }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'update failed');
      setMessage(
        next === 'FIRE'
          ? 'AXON is now LIVE — automations are armed.'
          : 'AXON returned to HOLD — everything is paused.',
      );
      setConfirming(false);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const hold = mode === 'HOLD';

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Safety Rail</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Fire / Hold Control</h1>
          {!loading && <FireModePill mode={mode} />}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          The master gate for every autonomous action. While on{' '}
          <span className="text-axon-gold">HOLD</span>, nothing sends, publishes, dispatches, or
          fires. Flip to <span className="text-axon-success">FIRE</span> when you are ready to go
          live.
        </p>
      </header>

      <section
        className={`rounded-2xl border p-6 ${
          hold ? 'border-axon-gold/30 bg-axon-gold/5' : 'border-axon-success/30 bg-axon-success/5'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-axon-muted">Current state</p>
            <p className="mt-1 text-2xl font-semibold">
              {loading ? 'Checking…' : hold ? 'HOLD — paused' : 'FIRE — live'}
            </p>
            <p className="mt-1 text-xs text-axon-muted">
              Source: {source === 'env' ? 'environment override' : source === 'ni-brain' ? 'NI-Brain' : 'default (safe)'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {hold ? (
              confirming ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode('FIRE')}
                    className="rounded-lg border border-axon-success/50 bg-axon-success/15 px-4 py-2 text-sm font-semibold text-axon-success transition hover:bg-axon-success/25 disabled:opacity-50"
                  >
                    {busy ? 'Firing…' : 'Confirm FIRE'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-axon-border px-4 py-2 text-sm text-axon-muted hover:bg-axon-elevated"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => setConfirming(true)}
                  className="rounded-lg border border-axon-success/50 bg-axon-success/10 px-5 py-2.5 text-sm font-semibold text-axon-success transition hover:bg-axon-success/20 disabled:opacity-50"
                >
                  Fire AXON →
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => setMode('HOLD')}
                className="rounded-lg border border-axon-gold/50 bg-axon-gold/10 px-5 py-2.5 text-sm font-semibold text-axon-gold transition hover:bg-axon-gold/20 disabled:opacity-50"
              >
                Return to HOLD
              </button>
            )}
          </div>
        </div>
        {message && <p className="mt-4 text-sm text-axon-text">{message}</p>}
        {error && (
          <p className="mt-4 text-xs text-axon-muted">
            Note: {error}. Defaulting to HOLD for safety.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">What HOLD blocks</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {blocked.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-axon-border bg-axon-surface p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-axon-text">{b.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    hold ? 'bg-axon-gold/15 text-axon-gold' : 'bg-axon-success/15 text-axon-success'
                  }`}
                >
                  {hold ? 'Blocked' : 'Allowed'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-axon-muted">{b.detail}</p>
              <p className="mt-1 font-mono text-[10px] text-axon-muted/70">{b.id}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-lg font-medium">How you fire Monday</h2>
        <ol className="mt-3 space-y-2 text-sm text-axon-muted">
          <li>
            <span className="mr-2 font-mono text-axon-gold">1.</span>
            Review each tool — Content Machine, Reddit Queues, NI Outreach — and approve what should
            go out.
          </li>
          <li>
            <span className="mr-2 font-mono text-axon-gold">2.</span>
            Come back here and press <span className="text-axon-success">Fire AXON</span>, then
            confirm.
          </li>
          <li>
            <span className="mr-2 font-mono text-axon-gold">3.</span>
            The gate flips to FIRE (stored in NI-Brain). Sends, publishes, dispatches and cron
            enables are armed immediately.
          </li>
          <li>
            <span className="mr-2 font-mono text-axon-gold">4.</span>
            Press <span className="text-axon-gold">Return to HOLD</span> anytime to pause everything
            again.
          </li>
        </ol>
        <p className="mt-4 text-xs text-axon-muted">
          Guarded endpoints return HTTP 423 while on HOLD, so nothing can slip through even if
          triggered directly.
        </p>
      </section>

      <AxonToolFooter toolSlug="fire-hold" basePath={basePath} />
    </div>
  );
}
