'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';

export type FireMode = 'HOLD' | 'FIRE';

export interface FireGateState {
  mode: FireMode;
  source: 'env' | 'ni-brain' | 'default';
  blocked: { id: string; label: string; detail: string }[];
  loading: boolean;
  error: string | null;
}

export function useFireGate(): FireGateState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<FireGateState>({
    mode: 'HOLD',
    source: 'default',
    blocked: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/axon/fire-gate'), { cache: 'no-store' });
      const data = await r.json();
      setState({
        mode: data.mode === 'FIRE' ? 'FIRE' : 'HOLD',
        source: data.source || 'default',
        blocked: Array.isArray(data.blocked) ? data.blocked : [],
        loading: false,
        error: data.ok === false ? data.error ?? null : null,
      });
    } catch (e) {
      // Fail safe — treat as HOLD.
      setState((prev) => ({
        ...prev,
        mode: 'HOLD',
        loading: false,
        error: e instanceof Error ? e.message : 'fire-gate unreachable',
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

export function FireModePill({ mode }: { mode: FireMode }) {
  const hold = mode === 'HOLD';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${
        hold
          ? 'border-axon-gold/40 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-success/40 bg-axon-success/10 text-axon-success'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${hold ? 'bg-axon-gold' : 'bg-axon-success'}`}
      />
      {hold ? 'HOLD' : 'FIRE'}
    </span>
  );
}

/** Dashboard-wide status banner. Only renders (prominently) while HOLD. */
export function FireGateBanner({ basePath }: { basePath?: string }) {
  const { mode, loading } = useFireGate();
  const href = basePath ? appPath('/tools/fire-hold', basePath) : '/tools/fire-hold';

  if (loading) return null;

  if (mode === 'FIRE') {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-axon-success/30 bg-axon-success/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <FireModePill mode="FIRE" />
          <p className="text-sm text-axon-text">
            AXON is <span className="font-semibold text-axon-success">LIVE</span> — automations may
            send, publish and fire.
          </p>
        </div>
        <Link href={href} className="text-xs font-medium text-axon-muted hover:text-axon-gold">
          Manage →
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-axon-gold/30 bg-axon-gold/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <FireModePill mode="HOLD" />
        <p className="text-sm text-axon-text">
          AXON is on <span className="font-semibold text-axon-gold">HOLD</span> — nothing sends,
          publishes, or fires until you fire the gate.
        </p>
      </div>
      <Link
        href={href}
        className="rounded-lg border border-axon-gold/40 bg-axon-gold/10 px-4 py-1.5 text-xs font-medium text-axon-gold transition hover:bg-axon-gold/20"
      >
        Open Fire / Hold Control →
      </Link>
    </div>
  );
}

/** Inline notice used inside tools where a gated action lives. */
export function FireGateNotice({ mode, action }: { mode: FireMode; action: string }) {
  if (mode === 'FIRE') return null;
  return (
    <p className="rounded-lg border border-axon-gold/30 bg-axon-gold/5 px-4 py-2.5 text-xs text-axon-gold">
      {action} is blocked while AXON is on HOLD. Approvals and edits still work — publishing waits
      for FIRE.
    </p>
  );
}
