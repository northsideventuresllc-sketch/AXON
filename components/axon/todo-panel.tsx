'use client';

import type { TodoItem } from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

interface TodoPanelProps {
  items: TodoItem[];
  autonomous: boolean;
  onRefresh: () => void;
}

export function TodoPanel({ items, autonomous, onRefresh }: TodoPanelProps) {
  const open = items.filter((t) => !t.done);
  const done = items.filter((t) => t.done);

  async function toggle(id: string) {
    await fetch(apiUrl('/api/axon/workspace'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle_todo_id: id }),
    });
    onRefresh();
  }

  async function remove(id: string) {
    await fetch(apiUrl('/api/axon/workspace'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_todo_id: id }),
    });
    onRefresh();
  }

  return (
    <section className="axon-card-3d axon-glass flex flex-col rounded-2xl overflow-hidden">
      <header className="border-b border-axon-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">To-Do</h2>
          {autonomous && (
            <span className="rounded-full bg-axon-blue/20 px-2 py-0.5 text-[10px] text-axon-cyan animate-pulse-glow">
              Autonomous
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-axon-muted">
          Command AXON to add tasks — it learns and manages over time
        </p>
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto p-3 max-h-[280px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-2xl text-axon-blue/50 animate-float">☐</span>
            <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-axon-muted">
              Try: “Add a to-do to follow up with Acme Corp by Friday.”
            </p>
          </div>
        ) : (
          <>
            {open.map((item) => (
              <TodoRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
            ))}
            {done.length > 0 && (
              <p className="pt-2 text-[10px] uppercase tracking-wider text-axon-muted">
                Completed
              </p>
            )}
            {done.map((item) => (
              <TodoRow key={item.id} item={item} onToggle={toggle} onRemove={remove} done />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function TodoRow({
  item,
  onToggle,
  onRemove,
  done,
}: {
  item: TodoItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  done?: boolean;
}) {
  return (
    <div
      className={`group flex items-start gap-2 rounded-lg border px-2 py-2 transition hover:border-axon-blue/30 ${
        done
          ? 'border-axon-border/30 bg-axon-elevated/20 opacity-60'
          : 'border-axon-border/50 bg-axon-elevated/40'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition ${
          item.done
            ? 'border-axon-blue bg-axon-blue/40 text-axon-text'
            : 'border-axon-muted/50 hover:border-axon-blue-glow'
        }`}
        aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.done ? '✓' : ''}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${item.done ? 'line-through text-axon-muted' : 'text-axon-text'}`}>
          {item.text}
        </p>
        {item.source === 'axon' && !done && (
          <span className="text-[9px] text-axon-muted">Added by AXON</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 rounded p-1 text-axon-muted opacity-0 transition hover:text-axon-danger group-hover:opacity-100"
        aria-label="Remove task"
      >
        ×
      </button>
    </div>
  );
}
