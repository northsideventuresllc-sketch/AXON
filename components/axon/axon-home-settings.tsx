'use client';

import { useState } from 'react';
import {
  HOME_WIDGET_LABELS,
  type AxonPreferences,
  type HomeLayoutPrefs,
  type HomeWidgetId,
} from '@/lib/axon-types';
import { apiUrl } from '@/lib/api-base';

const ALL_WIDGETS: HomeWidgetId[] = [
  'test_buttons',
  'briefing',
  'chat',
  'todo',
  'notifications',
  'orb',
  'controls',
];

interface AxonHomeSettingsProps {
  initial: HomeLayoutPrefs;
}

export function AxonHomeSettings({ initial }: AxonHomeSettingsProps) {
  const [layout, setLayout] = useState<HomeLayoutPrefs>(initial);
  const [dragItem, setDragItem] = useState<{ id: HomeWidgetId; from: keyof HomeLayoutPrefs } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function visible(id: HomeWidgetId) {
    return !layout.hidden.includes(id);
  }

  function toggleVisibility(id: HomeWidgetId) {
    setLayout((prev) => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter((x) => x !== id)
        : [...prev.hidden, id];
      return { ...prev, hidden };
    });
  }

  function onDragStart(id: HomeWidgetId, from: 'left' | 'center' | 'right') {
    setDragItem({ id, from });
  }

  function onDrop(column: 'left' | 'center' | 'right') {
    if (!dragItem || dragItem.from === column) {
      setDragItem(null);
      return;
    }
    setLayout((prev) => {
      const fromKey = dragItem.from as 'left' | 'center' | 'right';
      const next = {
        ...prev,
        [fromKey]: (prev[fromKey] as HomeWidgetId[]).filter((x) => x !== dragItem.id),
        [column]: [...(prev[column] as HomeWidgetId[]), dragItem.id],
      };
      return next;
    });
    setDragItem(null);
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/axon/preferences'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeLayout: layout }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLayout(data.preferences.homeLayout);
      setMessage('Home layout saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
      <h2 className="text-sm font-medium text-axon-blue-glow">Home Page Layout</h2>
      <p className="mt-1 text-xs text-axon-muted">
        Drag widgets between columns and toggle visibility. Make AXON yours.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {(['left', 'center', 'right'] as const).map((col) => (
          <ColumnDropZone
            key={col}
            label={col === 'left' ? 'Left column' : col === 'center' ? 'Center column' : 'Right column'}
            items={layout[col]}
            onDragStart={(id) => onDragStart(id, col)}
            onDrop={() => onDrop(col)}
          />
        ))}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-axon-muted">Widget visibility</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_WIDGETS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleVisibility(id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                visible(id)
                  ? 'border-axon-blue/50 bg-axon-blue/15 text-axon-cyan'
                  : 'border-axon-border text-axon-muted line-through opacity-60'
              }`}
            >
              {HOME_WIDGET_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg axon-gradient-btn px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save layout'}
        </button>
        {message && <span className="text-xs text-axon-muted">{message}</span>}
      </div>
    </section>
  );
}

function ColumnDropZone({
  label,
  items,
  onDragStart,
  onDrop,
}: {
  label: string;
  items: HomeWidgetId[];
  onDragStart: (id: HomeWidgetId) => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="min-h-[160px] rounded-xl border border-dashed border-axon-border/70 bg-axon-elevated/40 p-3"
    >
      <p className="text-[10px] uppercase tracking-wider text-axon-muted">{label}</p>
      <ul className="mt-2 space-y-2">
        {items.map((id) => (
          <li
            key={id}
            draggable
            onDragStart={() => onDragStart(id)}
            className="cursor-grab rounded-lg border border-axon-border/60 bg-axon-surface px-3 py-2 text-xs active:cursor-grabbing"
          >
            {HOME_WIDGET_LABELS[id]}
          </li>
        ))}
      </ul>
    </div>
  );
}
