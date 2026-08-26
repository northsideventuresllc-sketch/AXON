'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_AGENTS } from '@/lib/axon-v0/types';

const DEFAULTS_KEY = 'axon.v0.default_agents';

interface DefaultAgent {
  role: string;
  name: string;
}

const SEED: DefaultAgent[] = DEFAULT_AGENTS.map((a) => ({ role: a.role, name: a.name }));

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadDefaults(): DefaultAgent[] {
  if (typeof window === 'undefined') return SEED;
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return SEED;
    const arr = JSON.parse(raw) as DefaultAgent[];
    if (!Array.isArray(arr)) return SEED;
    return arr
      .filter((a) => a && typeof a.name === 'string' && typeof a.role === 'string')
      .map((a) => ({ role: a.role, name: a.name }));
  } catch {
    return SEED;
  }
}

function saveDefaults(list: DefaultAgent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(list));
  } catch {
    /* private window / storage blocked — non-fatal */
  }
}

export function DefaultAgentsPanel() {
  const [agents, setAgents] = useState<DefaultAgent[]>(SEED);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    setAgents(loadDefaults());
  }, []);

  const commit = useCallback((next: DefaultAgent[]) => {
    setAgents(next);
    saveDefaults(next);
  }, []);

  const add = useCallback(() => {
    const cleanName = titleCase(name);
    const cleanRole = titleCase(role);
    if (!cleanName || !cleanRole) return;
    commit([...agents, { name: cleanName, role: cleanRole }]);
    setName('');
    setRole('');
  }, [name, role, agents, commit]);

  const remove = useCallback(
    (idx: number) => {
      commit(agents.filter((_, i) => i !== idx));
    },
    [agents, commit]
  );

  const recall = useCallback(() => {
    commit(SEED);
  }, [commit]);

  return (
    <section className="v0-panel ag-defaults mt-8 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ag-venture-title text-lg">DEFAULT AGENTS</h2>
        <button type="button" onClick={recall} className="v0-chip ag-defaults-recall">
          Recall provided defaults
        </button>
      </div>
      <p className="ag-defaults-note mt-1 text-[11px] text-slate-500">
        New ventures start with these agents.
      </p>

      <ul className="mt-3 space-y-2">
        {agents.length === 0 && (
          <li className="text-xs text-slate-500">No default agents. Recall the provided set or add one below.</li>
        )}
        {agents.map((a, i) => (
          <li key={`${a.role}-${a.name}-${i}`} className="ag-defaults-row flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-cyan-50">{a.name}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">{a.role}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="ag-defaults-remove"
              aria-label={`Remove ${a.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="ag-defaults-add mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.2em] text-slate-600">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            className="ag-defaults-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.2em] text-slate-600">Role</span>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="ag-defaults-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!name.trim() || !role.trim()}
          className="ag-defaults-btn"
        >
          Add default
        </button>
      </div>
    </section>
  );
}
