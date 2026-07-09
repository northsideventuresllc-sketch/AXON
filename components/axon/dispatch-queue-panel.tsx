'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

type DispatchItem = {
  id: string;
  code: string;
  title: string;
  manager_chat: string | null;
  repo: string | null;
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  fired: 'Sent to manager',
  blocked: 'Blocked',
  done: 'Done',
};

const QUEUE_API = apiUrl('/api/axon/dispatch/queue');
const FIRE_API = apiUrl('/api/axon/dispatch/fire');

export function DispatchQueuePanel() {
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(QUEUE_API);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function fireAll() {
    setFiring(true);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(FIRE_API, { method: 'POST', body: '{}' });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'fire failed');
      setMessage(data.message || 'Dispatch started — check Telegram for summary');
      setTimeout(load, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fire failed');
    } finally {
      setFiring(false);
    }
  }

  async function fireOne(code: string) {
    setFiring(true);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(FIRE_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'fire failed');
      setMessage(data.message || `Fired ${code}`);
      setTimeout(load, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fire failed');
    } finally {
      setFiring(false);
    }
  }

  const queued = items.filter((i) => i.status === 'queued');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Manager Dispatch</h1>
          <p className="mt-1 max-w-xl text-sm text-axon-muted">
            One click fires GitHub relay workflows automatically. Manager-phrase jobs send a
            Telegram cue and clear from this queue — paste the phrase in the listed manager chat.
          </p>
        </div>
        <button
          type="button"
          onClick={fireAll}
          disabled={firing || queued.length === 0}
          className="rounded-lg bg-axon-gold px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {firing ? 'Dispatching…' : `Dispatch All (${queued.length})`}
        </button>
      </header>

      {message && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-axon-muted">Loading queue…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-axon-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-mono text-axon-gold">{item.code}</td>
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 text-axon-muted">{item.manager_chat || item.repo}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'queued' && (
                      <button
                        type="button"
                        onClick={() => fireOne(item.code)}
                        disabled={firing}
                        className="text-xs text-axon-gold hover:underline disabled:opacity-40"
                      >
                        Fire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-axon-muted">
                    Queue empty — Hermes seeds it 3× daily from the weekly agenda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
