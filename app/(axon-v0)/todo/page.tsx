'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import '@/components/axon-v0/todo.css';
import { plainTodoStatus, todoStatusDotClass } from '@/lib/axon-v0/plain-labels';

interface RollingTaskRow {
  id: string;
  task_type: string;
  cadence: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  venture: string;
  description: string;
  status: string;
  done: boolean;
}

interface QueueRow {
  code: string;
  what: string;
  status: string;
  done: boolean;
}

interface TodoData {
  repeating: RollingTaskRow[];
  nonRepeating: RollingTaskRow[];
  queue: QueueRow[];
}

const DAY_NAMES: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

// A first-sentence-ish short title from the long-form description, so the Task
// column reads as a label rather than a wall of text — Description keeps the full line.
function shortTask(description: string): string {
  const text = String(description || '').trim();
  if (!text) return 'Untitled';
  const cut = text.search(/[.!?—]\s|\n/);
  const head = cut > 0 && cut < 70 ? text.slice(0, cut) : text.slice(0, 60);
  return head.length < text.length ? `${head.trim()}…` : head.trim();
}

// Repeating table has no separate Cadence column (locked columns are exactly
// # · Task · Description · Venture · Status) — folded into the Task label instead,
// e.g. "Daily · Check inbox" / "Weekly · Mon · Content slot".
function repeatingTaskLabel(row: RollingTaskRow): string {
  return `${cadenceLabel(row)} · ${shortTask(row.description)}`;
}

function cadenceLabel(row: RollingTaskRow): string {
  if (row.cadence === 'daily') return 'Daily';
  if (row.cadence === 'weekly') return `Weekly · ${DAY_NAMES[row.day_of_week || 0] || ''}`.trim();
  if (row.cadence === 'monthly') return 'Monthly';
  return 'One-off';
}

function Corners() {
  return (
    <span className="td-corners" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function StatusChip({ status, done }: { status: string; done: boolean }) {
  return (
    <span className="td-status">
      <span className={`td-dot ${todoStatusDotClass(status, done)}`} />
      {plainTodoStatus(status, done)}
    </span>
  );
}

function RepeatingTable({ rows }: { rows: RollingTaskRow[] }) {
  if (!rows.length) {
    return <div className="td-empty">Nothing repeating on the list right now.</div>;
  }
  return (
    <div className="td-table-wrap">
      <table className="td-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Task</th>
            <th>Description</th>
            <th>Venture</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.done ? 'td-row-done' : ''}>
              <td>{i + 1}</td>
              <td className="td-task">{repeatingTaskLabel(r)}</td>
              <td className="td-desc">{r.description}</td>
              <td>{r.venture}</td>
              <td>
                <StatusChip status={r.status} done={r.done} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NonRepeatingTable({ rows }: { rows: RollingTaskRow[] }) {
  if (!rows.length) {
    return <div className="td-empty">Nothing on the list.</div>;
  }
  return (
    <div className="td-table-wrap">
      <table className="td-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Task</th>
            <th>Description</th>
            <th>Venture</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.done ? 'td-row-done' : ''}>
              <td>{i + 1}</td>
              <td className="td-task">{shortTask(r.description)}</td>
              <td className="td-desc">{r.description}</td>
              <td>{r.venture}</td>
              <td>
                <StatusChip status={r.status} done={r.done} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueTable({ rows }: { rows: QueueRow[] }) {
  if (!rows.length) {
    return <div className="td-empty">Nothing in the queue.</div>;
  }
  return (
    <div className="td-table-wrap">
      <table className="td-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>What</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={r.done ? 'td-row-done' : ''}>
              <td className="td-task">{r.code}</td>
              <td className="td-desc">{r.what}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TodoPage() {
  const [data, setData] = useState<TodoData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/axon-v0/todo'));
        const body = await res.json();
        if (!cancelled) {
          if (body?.ok === false) {
            setError(true);
          } else {
            setData({
              repeating: Array.isArray(body?.repeating) ? body.repeating : [],
              nonRepeating: Array.isArray(body?.nonRepeating) ? body.nonRepeating : [],
              queue: Array.isArray(body?.queue) ? body.queue : [],
            });
            setError(false);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">TO-DO</h1>
      <p className="mt-2 text-sm text-slate-400">
        JB&apos;s rolling to-do list — repeating tasks, everything else open, and the dispatch
        queue.
      </p>

      {loading && <div className="td-empty mt-6">Loading the list…</div>}

      {!loading && error && (
        <div className="td-empty mt-6">Couldn&apos;t load the list right now.</div>
      )}

      {!loading && !error && data && (
        <div className="mt-6 space-y-8">
          <section className="td-section">
            <div className="v0-panel td-panel">
              <Corners />
              <div className="td-micro mb-3">Repeating</div>
              <RepeatingTable rows={data.repeating} />
            </div>
          </section>

          <section className="td-section">
            <div className="v0-panel td-panel">
              <Corners />
              <div className="td-micro mb-3">Non-repeating</div>
              <NonRepeatingTable rows={data.nonRepeating} />
            </div>
          </section>

          <section className="td-section">
            <div className="v0-panel td-panel">
              <Corners />
              <div className="td-micro mb-3">Queue</div>
              <QueueTable rows={data.queue} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
