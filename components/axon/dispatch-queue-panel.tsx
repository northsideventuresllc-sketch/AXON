'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { AxonToolFooter } from './axon-tool-footer';
import { CronJobsPanel } from './cron-jobs-panel';

type DispatchItem = {
  id: string;
  code: string;
  title: string;
  owner: string;
  manager_chat: string | null;
  repo: string | null;
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
  workflow_repo: string | null;
  risk_tier: string | null;
  created_at: string | null;
  result_summary: string | null;
};

type SortMode = 'venture' | 'complexity' | 'date';
type SortDir = 'asc' | 'desc';

type FilterState = {
  sortBy: SortMode;
  sortDir: SortDir;
  ventures: string[];
  complexities: Array<'high' | 'medium' | 'low'>;
};

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  fired: 'Sent to manager',
  blocked: 'Blocked',
  completed: 'Completed',
  done: 'Completed',
};

const COMPLETED_SINCE = '2025-06-29';

const COMPLEXITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const COMPLEXITY_ORDER = { high: 0, medium: 1, low: 2 };

const QUEUE_API = apiUrl('/api/axon/dispatch/queue');
const FIRE_API = apiUrl('/api/axon/dispatch/fire');

type QueueView = 'active' | 'completed' | 'cron';

function deriveVenture(item: DispatchItem): string {
  const blob = `${item.repo || ''} ${item.workflow_repo || ''} ${item.code || ''}`.toLowerCase();
  if (blob.includes('match-fit') || blob.includes('matchfit')) return 'Match Fit';
  if (blob.includes('northside-intelligence')) return 'NORTHSiDE Portal';
  if (blob.includes('axon')) return 'AXON';
  if (blob.includes('nv-vault') || blob.includes('vault')) return 'nv-vault';
  if (blob.includes('replyflow')) return 'ReplyFlow';
  return item.owner?.trim() || 'Other';
}

function deriveComplexity(item: DispatchItem): 'high' | 'medium' | 'low' {
  const tier = (item.risk_tier || '').toLowerCase();
  if (['high', 'critical', 'p0', 'p1'].includes(tier)) return 'high';
  if (['medium', 'moderate', 'p2'].includes(tier)) return 'medium';
  if (['low', 'p3', 'routine'].includes(tier)) return 'low';
  if (item.priority <= 3) return 'high';
  if (item.priority <= 6) return 'medium';
  return 'low';
}

function defaultFilters(items: DispatchItem[]): FilterState {
  const ventures = Array.from(new Set(items.map(deriveVenture))).sort();
  return {
    sortBy: 'date',
    sortDir: 'desc',
    ventures,
    complexities: ['high', 'medium', 'low'],
  };
}

function applyFilters(items: DispatchItem[], filters: FilterState): DispatchItem[] {
  let list = items.filter((item) => {
    const v = deriveVenture(item);
    const c = deriveComplexity(item);
    if (filters.ventures.length && !filters.ventures.includes(v)) return false;
    if (filters.complexities.length && !filters.complexities.includes(c)) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    let cmp = 0;
    if (filters.sortBy === 'venture') {
      cmp = deriveVenture(a).localeCompare(deriveVenture(b));
    } else if (filters.sortBy === 'complexity') {
      cmp = COMPLEXITY_ORDER[deriveComplexity(a)] - COMPLEXITY_ORDER[deriveComplexity(b)];
    } else {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      cmp = da - db;
    }
    return filters.sortDir === 'asc' ? cmp : -cmp;
  });

  return list;
}

function progressPercent(items: DispatchItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((i) => ['fired', 'running'].includes(i.status)).length;
  return Math.round((done / items.length) * 100);
}

export function DispatchQueuePanel() {
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<SortMode>('venture');
  const [selected, setSelected] = useState<DispatchItem | null>(null);
  const [livePoll, setLivePoll] = useState(false);
  const [queueView, setQueueView] = useState<QueueView>('active');

  const allVentures = useMemo(() => Array.from(new Set(items.map(deriveVenture))).sort(), [items]);
  const activeFilters = filters ?? defaultFilters(items);
  const visible = useMemo(() => applyFilters(items, activeFilters), [items, activeFilters]);
  const queued = visible.filter((i) => i.status === 'queued');
  const running = items.filter((i) => i.status === 'running');
  const progress = progressPercent(items);
  const showLiveBar = firing || running.length > 0 || livePoll;

  const load = useCallback(async () => {
    setError(null);
    try {
      const url =
        queueView === 'completed'
          ? `${QUEUE_API}?view=completed&since=${COMPLETED_SINCE}&limit=500`
          : queueView === 'cron'
            ? null
            : QUEUE_API;
      if (!url) {
        setLoading(false);
        return;
      }
      const r = await fetch(url);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setItems(data.items || []);
      if (!filters && data.items?.length) {
        setFilters(defaultFilters(data.items));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [filters, queueView]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showLiveBar) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [showLiveBar, load]);

  async function fireAll() {
    setFiring(true);
    setLivePoll(true);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(FIRE_API, { method: 'POST', body: '{}' });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'fire failed');
      setMessage(data.message || 'Dispatch started — check Telegram for summary');
      setTimeout(load, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fire failed');
    } finally {
      setFiring(false);
      setTimeout(() => setLivePoll(false), 15000);
    }
  }

  async function fireOne(code: string) {
    setFiring(true);
    setLivePoll(true);
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
      setTimeout(() => setLivePoll(false), 10000);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Repo Manager Agent Dispatch</h1>
          <p className="mt-1 max-w-xl text-sm text-axon-muted">
            One click fires Hermes workflows and cues repo managers. Live progress below — Telegram
            summary when complete.
            {queueView === 'completed' && (
              <span className="mt-1 block text-axon-gold">
                Showing merged activity since June 29, 2025 (this week and last week).
              </span>
            )}
            {queueView === 'cron' && (
              <span className="mt-1 block text-axon-gold">
                Repeating workflows — start/stop, run history, and next scheduled fire.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-axon-border p-0.5">
            {(['active', 'completed', 'cron'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setLoading(v !== 'cron');
                  setQueueView(v);
                }}
                className={`rounded-md px-3 py-1.5 text-xs capitalize ${
                  queueView === v ? 'bg-axon-gold/20 text-axon-gold' : 'text-axon-muted'
                }`}
              >
                {v === 'active' ? 'Active queue' : v === 'completed' ? 'Completed' : 'Cron jobs'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            disabled={queueView === 'cron'}
            className="rounded-lg border border-axon-border px-4 py-2.5 text-sm text-axon-muted hover:border-axon-gold/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Filter &amp; sort
          </button>
          <button
            type="button"
            onClick={fireAll}
            disabled={firing || queued.length === 0 || queueView === 'completed'}
            className="rounded-lg bg-axon-gold px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {firing ? 'Dispatching…' : `Dispatch All (${queued.length})`}
          </button>
        </div>
      </header>

      {queueView !== 'cron' && (
      <div className="rounded-xl border border-white/10 bg-axon-surface p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-axon-muted">
          <span>Queue progress</span>
          <span>{progress}% · {running.length} running · {queued.length} queued</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-axon-gold transition-all duration-500 ${
              showLiveBar && progress < 100 ? 'animate-pulse' : ''
            }`}
            style={{ width: `${Math.max(showLiveBar && progress === 0 ? 8 : progress, firing ? 12 : 0)}%` }}
          />
        </div>
        {firing && (
          <p className="mt-2 text-xs text-axon-gold">Firing Hermes workflows…</p>
        )}
      </div>
      )}

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

      {queueView === 'cron' ? (
        <CronJobsPanel />
      ) : loading && !items.length ? (
        <p className="text-sm text-axon-muted">Loading queue…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-axon-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Venture</th>
                <th className="px-4 py-3 font-medium">Complexity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-t border-white/5 transition hover:bg-white/5"
                  onClick={() => setSelected(item)}
                >
                  <td className="px-4 py-3 font-mono text-axon-gold">{item.code}</td>
                  <td className="px-4 py-3 text-white">{item.title}</td>
                  <td className="px-4 py-3 text-axon-muted">{deriveVenture(item)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {COMPLEXITY_LABEL[deriveComplexity(item)]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
              {!visible.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-axon-muted">
                    {items.length ? 'No tasks match filters.' : 'Queue empty — Hermes seeds 3× daily.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {filterOpen && (
        <FilterModal
          tab={filterTab}
          onTab={setFilterTab}
          filters={activeFilters}
          ventures={allVentures}
          onApply={setFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {selected && (
        <TaskDetailModal
          task={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
            setSelected(updated);
          }}
        />
      )}
      <AxonToolFooter toolSlug="manager-dispatch" />
    </div>
  );
}

function FilterModal({
  tab,
  onTab,
  filters,
  ventures,
  onApply,
  onClose,
}: {
  tab: SortMode;
  onTab: (t: SortMode) => void;
  filters: FilterState;
  ventures: string[];
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterState>(filters);

  const tabs: { id: SortMode; label: string }[] = [
    { id: 'venture', label: 'Venture' },
    { id: 'complexity', label: 'Complexity' },
    { id: 'date', label: 'Date added' },
  ];

  function toggleVenture(v: string) {
    setDraft((d) => ({
      ...d,
      ventures: d.ventures.includes(v) ? d.ventures.filter((x) => x !== v) : [...d.ventures, v],
    }));
  }

  function toggleComplexity(c: 'high' | 'medium' | 'low') {
    setDraft((d) => ({
      ...d,
      complexities: d.complexities.includes(c)
        ? d.complexities.filter((x) => x !== c)
        : [...d.complexities, c],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-axon-border bg-axon-surface p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Filter &amp; organize</h3>
        <p className="mt-1 text-sm text-axon-muted">Choose a tab to customize how tasks are sorted and filtered.</p>

        <div className="mt-4 flex gap-1 rounded-lg border border-axon-border p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onTab(t.id);
                setDraft((d) => ({ ...d, sortBy: t.id }));
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
                tab === t.id ? 'bg-axon-gold/20 text-axon-gold' : 'text-axon-muted hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-[140px] space-y-3">
          {tab === 'venture' && (
            <>
              <p className="text-xs text-axon-muted">Show ventures (tap to toggle)</p>
              <div className="flex flex-wrap gap-2">
                {ventures.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVenture(v)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      draft.ventures.includes(v)
                        ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                        : 'border-axon-border text-axon-muted'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-axon-muted">
                <input
                  type="checkbox"
                  checked={draft.sortBy === 'venture'}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sortBy: 'venture', sortDir: e.target.checked ? 'asc' : d.sortDir }))
                  }
                />
                Sort alphabetically by venture
              </label>
            </>
          )}

          {tab === 'complexity' && (
            <>
              <p className="text-xs text-axon-muted">Complexity tiers</p>
              {(['high', 'medium', 'low'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleComplexity(c)}
                  className={`mr-2 rounded-full border px-3 py-1 text-xs ${
                    draft.complexities.includes(c)
                      ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                      : 'border-axon-border text-axon-muted'
                  }`}
                >
                  {COMPLEXITY_LABEL[c]}
                </button>
              ))}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sortBy: 'complexity', sortDir: 'asc' }))}
                  className={`text-xs ${draft.sortBy === 'complexity' && draft.sortDir === 'asc' ? 'text-axon-gold' : 'text-axon-muted'}`}
                >
                  Sort: simple → complex
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sortBy: 'complexity', sortDir: 'desc' }))}
                  className={`text-xs ${draft.sortBy === 'complexity' && draft.sortDir === 'desc' ? 'text-axon-gold' : 'text-axon-muted'}`}
                >
                  complex → simple
                </button>
              </div>
            </>
          )}

          {tab === 'date' && (
            <>
              <p className="text-xs text-axon-muted">Order by date added to queue</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sortBy: 'date', sortDir: 'desc' }))}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    draft.sortBy === 'date' && draft.sortDir === 'desc'
                      ? 'border-axon-gold/50 text-axon-gold'
                      : 'border-axon-border text-axon-muted'
                  }`}
                >
                  Newest first
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, sortBy: 'date', sortDir: 'asc' }))}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    draft.sortBy === 'date' && draft.sortDir === 'asc'
                      ? 'border-axon-gold/50 text-axon-gold'
                      : 'border-axon-border text-axon-muted'
                  }`}
                >
                  Oldest first
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-axon-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="rounded-lg bg-axon-gold px-4 py-2 text-sm font-medium text-black"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  onClose,
  onSaved,
}: {
  task: DispatchItem;
  onClose: () => void;
  onSaved: (t: DispatchItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.dispatch_phrase || '');
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  async function saveEdits() {
    setSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/axon/dispatch/${encodeURIComponent(task.code)}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, dispatch_phrase: description }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'save failed');
      onSaved({ ...task, title: data.task.title, dispatch_phrase: data.task.dispatch_phrase });
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const nextHistory = [...chat, { role: 'user' as const, content: userMsg }];
    setChat(nextHistory);
    setChatLoading(true);
    try {
      const r = await fetch(apiUrl('/api/axon/dispatch/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: task.code, message: userMsg, history: nextHistory }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'chat failed');
      setChat((c) => [...c, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setChat((c) => [
        ...c,
        { role: 'assistant', content: e instanceof Error ? e.message : 'Chat unavailable' },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-axon-border bg-axon-surface shadow-2xl">
        <div className="border-b border-axon-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-axon-gold">{task.code}</p>
              {editing ? (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded border border-axon-border bg-axon-elevated px-2 py-1 text-lg text-white"
                />
              ) : (
                <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-axon-muted hover:text-white">
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-axon-muted">
            {deriveVenture(task)} · {COMPLEXITY_LABEL[deriveComplexity(task)]} ·{' '}
            {STATUS_LABEL[task.status] || task.status}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <p className="text-xs uppercase text-axon-muted">Description</p>
            {editing ? (
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded border border-axon-border bg-axon-elevated px-3 py-2 text-sm text-white"
              />
            ) : (
              <p className="mt-1 text-sm text-axon-muted">
                {description || 'No description — ask the assistant below.'}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveEdits}
                  className="rounded-lg bg-axon-gold px-3 py-1.5 text-sm text-black disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setTitle(task.title);
                    setDescription(task.dispatch_phrase || '');
                  }}
                  className="text-sm text-axon-muted"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-axon-border px-3 py-1.5 text-sm hover:bg-axon-elevated"
              >
                Edit task
              </button>
            )}
          </div>

          <div className="border-t border-axon-border pt-4">
            <p className="text-xs uppercase text-axon-muted">Task assistant</p>
            <p className="mt-1 text-xs text-axon-muted">
              Ask what this task does, why it&apos;s queued, or how to refine it.
            </p>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg bg-axon-elevated/50 p-3">
              {!chat.length && (
                <p className="text-xs text-axon-muted">e.g. &quot;What repo does this touch?&quot;</p>
              )}
              {chat.map((m, i) => (
                <p
                  key={i}
                  className={`text-sm ${m.role === 'user' ? 'text-axon-gold' : 'text-axon-muted'}`}
                >
                  <span className="font-medium">{m.role === 'user' ? 'You' : 'AXON'}:</span> {m.content}
                </p>
              ))}
              {chatLoading && <p className="text-xs text-axon-muted">Thinking…</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Ask about this task…"
                className="flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading}
                className="rounded-lg bg-axon-gold/20 px-3 py-2 text-sm text-axon-gold disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
