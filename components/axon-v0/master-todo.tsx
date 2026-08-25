'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { startDictation } from '@/components/axon-v0/voice';
import './widgets.css';

interface Todo {
  id: string;
  text: string;
  done: boolean;
  source?: string;
  due?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface Workspace {
  todos?: Todo[];
  todos_autonomous?: boolean;
}

function fmtDue(due?: string | null): { label: string; late: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const late = d.getTime() < today.getTime();
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { label, late };
}

export function MasterTodo() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [autonomous, setAutonomous] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [addSupported, setAddSupported] = useState(true);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  function apply(ws: Workspace | undefined) {
    setTodos(Array.isArray(ws?.todos) ? ws!.todos! : []);
    setAutonomous(Boolean(ws?.todos_autonomous));
  }

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon/workspace'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        apply(d.workspace);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(apiUrl('/api/axon/workspace'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return false;
      const d = await r.json();
      if (d.workspace) apply(d.workspace);
      return true;
    } catch {
      return false;
    }
  }

  function toggle(id: string) {
    patch({ toggle_todo_id: id });
  }

  function remove(id: string) {
    patch({ remove_todo_id: id });
  }

  async function add() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    // Preferred shape per spec; fall back to todo_updates which the API supports.
    let ok = await patch({ add_todo: { text: t, due: due || null } });
    if (!ok) {
      ok = await patch({
        todo_updates: [{ action: 'add', text: t, due: due || null, source: 'user' }],
      });
    }
    setBusy(false);
    if (ok) {
      setText('');
      setDue('');
    } else {
      setAddSupported(false);
    }
  }

  function dictate() {
    if (listening) return;
    const stop = startDictation(
      (r) => setText((prev) => (prev ? `${prev} ${r}` : r)),
      () => setListening(false)
    );
    if (stop) setListening(true);
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="wg-head">Master To-Do</span>
        {autonomous && <span className="wg-sub">autonomous</span>}
      </div>

      {/* add form */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <input
            className="wg-field"
            placeholder="Add a to-do…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button
            className={`wg-mic${listening ? ' wg-mic-on' : ''}`}
            onClick={dictate}
            aria-label="Speak to add"
            title="Speak"
          >
            🎙
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            className="wg-field"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Deadline"
          />
          <button className="wg-btn" onClick={add} disabled={!text.trim() || busy}>
            Add
          </button>
        </div>
        {!addSupported && (
          <p className="wg-sub">Couldn’t save here — add via AXON chat instead.</p>
        )}
      </div>

      {/* open */}
      {open.length > 0 && (
        <ul className="space-y-1 pt-0.5">
          {open.map((t) => {
            const d = fmtDue(t.due);
            return (
              <li key={t.id} className="wg-row group flex items-center gap-2">
                <button
                  className="wg-check"
                  onClick={() => toggle(t.id)}
                  aria-label="Complete"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                  {t.text}
                </span>
                {d && <span className={`wg-due${d.late ? ' wg-due-late' : ''}`}>{d.label}</span>}
                <button
                  className="wg-icon-btn opacity-0 transition group-hover:opacity-100"
                  onClick={() => remove(t.id)}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* completed */}
      {done.length > 0 && (
        <ul className="space-y-1 pt-1">
          {done.map((t) => (
            <li key={t.id} className="wg-row group flex items-center gap-2">
              <button
                className="wg-check wg-check-on"
                onClick={() => toggle(t.id)}
                aria-label="Reopen"
              >
                ✓
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px] wg-todo-done">{t.text}</span>
              <button
                className="wg-icon-btn opacity-0 transition group-hover:opacity-100"
                onClick={() => remove(t.id)}
                aria-label="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {loaded && todos.length === 0 && (
        <p className="wg-sub leading-relaxed">
          {failed
            ? 'Your to-do list isn’t available right now. You can ask AXON to manage it in chat.'
            : 'Nothing on the list yet. Add one above — or just ask AXON to manage it for you.'}
        </p>
      )}

      <p className="wg-sub">You can also ask AXON to add, complete, or clear items.</p>
    </div>
  );
}

export default MasterTodo;
