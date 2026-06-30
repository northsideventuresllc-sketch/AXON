'use client';

import { useState } from 'react';
import { apiUrl } from '@/lib/api-base';

type ResetScope = 'memories_before' | 'communication' | 'context' | 'full';

export function AxonResetSettings() {
  const [beforeDate, setBeforeDate] = useState('');
  const [loading, setLoading] = useState<ResetScope | null>(null);
  const [message, setMessage] = useState('');

  async function reset(scope: ResetScope) {
    if (scope === 'full' && !confirm('Full reset clears all chat history, learnings, and memories. Continue?')) {
      return;
    }
    setLoading(scope);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/axon/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, beforeDate: beforeDate || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="rounded-xl border border-axon-danger/30 bg-axon-surface p-6">
      <h2 className="text-sm font-medium text-axon-danger">Reset & Clean Slate</h2>
      <p className="mt-1 text-xs text-axon-muted">
        AXON learns from every interaction. Reset specific layers or start fresh.
      </p>

      <div className="mt-4 space-y-4">
        <div className="rounded-lg border border-axon-border p-4">
          <p className="text-sm font-medium">Memories before date</p>
          <p className="mt-1 text-xs text-axon-muted">Clear long-term memories created before a specific date.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="date"
              value={beforeDate}
              onChange={(e) => setBeforeDate(e.target.value)}
              className="rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
            />
            <ResetButton
              label="Reset memories"
              loading={loading === 'memories_before'}
              disabled={!beforeDate}
              onClick={() => reset('memories_before')}
            />
          </div>
        </div>

        <ResetRow
          title="Communication learnings"
          detail="Clear tone signals, phrasing patterns, and evidence weights. Tone preset returns to default."
          label="Reset learnings"
          loading={loading === 'communication'}
          onClick={() => reset('communication')}
        />

        <ResetRow
          title="Context & memories"
          detail="Clear all memories and context data. Keeps chat history and communication signals."
          label="Reset context"
          loading={loading === 'context'}
          onClick={() => reset('context')}
        />

        <ResetRow
          title="Full clean slate"
          detail="Delete all chat history, memories, learnings, and reset tone to default starting mode."
          label="Full reset"
          loading={loading === 'full'}
          onClick={() => reset('full')}
          danger
        />
      </div>

      {message && (
        <p className="mt-4 rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm">{message}</p>
      )}
    </section>
  );
}

function ResetRow({
  title,
  detail,
  label,
  loading,
  onClick,
  danger,
}: {
  title: string;
  detail: string;
  label: string;
  loading: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-axon-border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-axon-muted">{detail}</p>
      </div>
      <ResetButton label={label} loading={loading} onClick={onClick} danger={danger} />
    </div>
  );
}

function ResetButton({
  label,
  loading,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading || disabled}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm transition disabled:opacity-40 ${
        danger
          ? 'border-axon-danger/50 text-axon-danger hover:bg-axon-danger/10'
          : 'border-axon-border hover:border-axon-gold/40'
      }`}
    >
      {loading ? 'Resetting…' : label}
    </button>
  );
}
