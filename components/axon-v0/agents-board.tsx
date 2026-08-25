'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { DefaultAgentsPanel } from './default-agents-panel';
import './agents.css';

const OPEN_KEY = 'axon.v0.agents.open';

function loadOpen(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, boolean>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveOpen(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(map));
  } catch {
    /* private window / storage blocked — non-fatal */
  }
}

type AgentStatus = 'running' | 'blocked' | 'active' | 'idle';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  tasksDone?: number;
  tasksTotal?: number;
  info?: string;
}

interface Group {
  ventureId: string;
  ventureName: string;
  agents: Agent[];
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'Running',
  blocked: 'Blocked',
  active: 'Active',
  idle: 'Idle',
};

function titleCase(role: string): string {
  return role
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusChip({ status }: { status: AgentStatus }) {
  return (
    <span className={`ag-status ag-status--${status}`}>
      <span className="ag-status-dot" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

function AgentCard({ agent, ventureName }: { agent: Agent; ventureName: string }) {
  const hasTasks = typeof agent.tasksTotal === 'number' && agent.tasksTotal > 0;
  const done = agent.tasksDone ?? 0;
  const total = agent.tasksTotal ?? 0;
  const pct = hasTasks ? Math.round((done / total) * 100) : 0;

  return (
    <div className="ag-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-cyan-50">{agent.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {titleCase(agent.role)}
          </p>
        </div>
        <StatusChip status={agent.status} />
      </div>

      {agent.info && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{agent.info}</p>
      )}

      {hasTasks ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Tasks</span>
            <span className="text-cyan-200/80">
              {done}/{total} done
            </span>
          </div>
          <div className="ag-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="ag-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-slate-600">No tasks assigned</p>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.2em] text-slate-600">Venture</span>
        <span className="v0-chip">{ventureName}</span>
      </div>
    </div>
  );
}

export function AgentsBoard() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpen(loadOpen());
  }, []);

  const toggle = useCallback((ventureId: string) => {
    setOpen((prev) => {
      const next = { ...prev, [ventureId]: prev[ventureId] === false ? true : false };
      saveOpen(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/agents'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setGroups(Array.isArray(d.groups) ? d.groups : []);
      })
      .catch(() => {
        if (alive) setGroups([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="v0-panel mt-6 p-6 text-sm text-slate-500">Loading agents…</div>;
  }

  const hasAgents = groups.some((g) => g.agents.length > 0);
  if (!hasAgents) {
    return (
      <div className="mt-6">
        <div className="v0-panel p-6 text-sm text-slate-500">No agents wired yet.</div>
        <DefaultAgentsPanel />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {groups
        .filter((g) => g.agents.length > 0)
        .map((g) => {
          const isOpen = open[g.ventureId] !== false;
          return (
            <section key={g.ventureId} className="ag-group">
              <button
                type="button"
                onClick={() => toggle(g.ventureId)}
                aria-expanded={isOpen}
                className="ag-venture-toggle flex w-full items-baseline gap-3 text-left"
              >
                <span className={`ag-caret ${isOpen ? 'ag-caret--open' : ''}`} aria-hidden>
                  ▶
                </span>
                <h2 className="ag-venture-title text-lg">{g.ventureName.toUpperCase()}</h2>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
                  {g.agents.length} agent{g.agents.length === 1 ? '' : 's'}
                </span>
              </button>
              {isOpen && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.agents.map((a) => (
                    <AgentCard key={a.id} agent={a} ventureName={g.ventureName} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      <DefaultAgentsPanel />
    </div>
  );
}
