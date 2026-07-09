'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';
import { AxonToolFooter } from './axon-tool-footer';

type DispatchTask = {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: number;
  action_type: string;
  owner: string;
  created_at: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'text-axon-muted' },
  running: { label: 'Running', color: 'text-axon-teal' },
  fired: { label: 'Sent to Manager', color: 'text-axon-gold' },
  blocked: { label: 'Blocked', color: 'text-red-400' },
};

export function HermesSyncTool({ basePath }: { basePath?: string }) {
  const [tasks, setTasks] = useState<DispatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeHref = basePath ? appPath('/', basePath) : '/';
  const dispatchHref = basePath ? appPath('/tools/dispatch', basePath) : '/tools/dispatch';

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/axon/dispatch/queue'));
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setTasks(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = Object.fromEntries(
    Object.keys(STATUS_CONFIG).map((s) => [s, tasks.filter((t) => t.status === s)]),
  );

  const statEntries = Object.entries(STATUS_CONFIG);

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <h1 className="mt-1 text-3xl font-semibold">NI Marketing HQ</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Marketing dispatch tasks from NI-Brain — status view. Fire and manage workflows in{' '}
          <Link href={dispatchHref} className="text-axon-gold hover:underline">
            Repo Manager Dispatch
          </Link>
          .
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statEntries.map(([status, cfg]) => (
          <div key={status} className="rounded-xl border border-axon-border bg-axon-surface p-4">
            <p className={`text-2xl font-semibold ${cfg.color}`}>{byStatus[status]?.length ?? 0}</p>
            <p className="mt-1 text-xs text-axon-muted">{cfg.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading && !tasks.length ? (
        <p className="text-sm text-axon-muted">Loading tasks…</p>
      ) : (
        <div className="space-y-6">
          {statEntries.map(([status, cfg]) => {
            const group = byStatus[status] ?? [];
            if (!group.length) return null;
            return (
              <section key={status}>
                <h2 className={`mb-3 text-xs font-medium uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label} ({group.length})
                </h2>
                <div className="overflow-hidden rounded-xl border border-axon-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-axon-muted">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Code</th>
                        <th className="px-4 py-2.5 font-medium">Task</th>
                        <th className="px-4 py-2.5 font-medium">Action</th>
                        <th className="px-4 py-2.5 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((task) => (
                        <tr key={task.id} className="border-t border-white/5">
                          <td className="px-4 py-3 font-mono text-xs text-axon-gold">{task.code}</td>
                          <td className="px-4 py-3 text-white">{task.title}</td>
                          <td className="px-4 py-3 text-xs text-axon-muted">{task.action_type}</td>
                          <td className="px-4 py-3 text-xs text-axon-muted">
                            {task.created_at
                              ? new Date(task.created_at).toLocaleDateString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
              <p className="text-axon-muted">Queue empty — Hermes seeds 3× daily.</p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Link
          href={dispatchHref}
          className="rounded-lg border border-axon-gold/40 bg-axon-gold/10 px-5 py-2.5 text-sm font-medium text-axon-gold transition hover:bg-axon-gold/20"
        >
          Open Repo Manager Dispatch →
        </Link>
      </div>
      <AxonToolFooter toolSlug="hermes-sync" basePath={basePath} />
    </div>
  );
}
