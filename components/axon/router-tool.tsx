'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { AxonToolFooter } from './axon-tool-footer';

// ─── Types (mirror docs/axon-router-spec.md §3) ────────────────────────────

type HealthStatus = 'healthy' | 'rate_limited' | 'dead';

type Health = {
  status: HealthStatus;
  reason: string | null;
  failure_count: number;
  backoff_seconds: number;
  retry_after: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
} | null;

type RouterModel = {
  id: string;
  model: string;
  tier_rank: number;
  priority: number;
  enabled: boolean;
  health: Health;
};

type RouterRoute = {
  id: string;
  name: string;
  kind: string;
  secret_key: string | null;
  base_url: string | null;
  enabled: boolean;
  health: Health;
  models: RouterModel[];
};

const ROUTER_API = apiUrl('/api/axon/router');

const TIER_LABEL: Record<number, string> = { 4: 'frontier', 3: 'capable', 2: 'free', 1: 'local' };
const TIER_ORDER = [4, 3, 2, 1];

// ─── Health badge ───────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: Health }) {
  const status = health?.status ?? 'healthy';
  const cls =
    status === 'dead'
      ? 'bg-axon-danger/20 text-axon-danger'
      : status === 'rate_limited'
        ? 'bg-axon-gold/20 text-axon-gold'
        : 'bg-axon-success/20 text-axon-success';
  const label = status === 'rate_limited' ? 'rate limited' : status;

  let detail: string | null = null;
  if (status === 'dead' && health?.reason) detail = health.reason;
  if (status === 'rate_limited' && health?.retry_after) {
    const t = new Date(health.retry_after);
    detail = Number.isNaN(t.getTime()) ? null : `retries after ${t.toLocaleTimeString()}`;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
      {detail && <span className="text-[11px] text-axon-muted">{detail}</span>}
    </span>
  );
}

// ─── Toggle switch (matches components/axon/axon-notification-settings.tsx) ─

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${
        checked ? 'bg-axon-blue' : 'bg-axon-border'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`}
      />
    </button>
  );
}

// ─── Model row ──────────────────────────────────────────────────────────────

function ModelRow({
  routeId,
  routeEnabled,
  model,
  busy,
  onToggle,
  onPriority,
  onClearHealth,
}: {
  routeId: string;
  routeEnabled: boolean;
  model: RouterModel;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onPriority: (priority: number) => void;
  onClearHealth: () => void;
}) {
  const [priorityInput, setPriorityInput] = useState(String(model.priority));

  useEffect(() => {
    setPriorityInput(String(model.priority));
  }, [model.priority]);

  function commitPriority() {
    const next = Number(priorityInput);
    if (Number.isInteger(next) && next !== model.priority) onPriority(next);
    else setPriorityInput(String(model.priority));
  }

  const dirty = model.health && model.health.status !== 'healthy';

  return (
    <tr className={`border-t border-axon-border/60 ${routeEnabled ? '' : 'opacity-50'}`}>
      <td className="px-3 py-2.5 font-mono text-xs text-axon-text">{model.model}</td>
      <td className="px-3 py-2.5 text-xs text-axon-muted">{TIER_LABEL[model.tier_rank] ?? model.tier_rank}</td>
      <td className="px-3 py-2.5">
        <input
          type="number"
          value={priorityInput}
          disabled={busy}
          onChange={(e) => setPriorityInput(e.target.value)}
          onBlur={commitPriority}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-16 rounded-md border border-axon-border bg-axon-surface px-2 py-1 text-xs text-axon-text outline-none focus:border-axon-blue-bright/60"
        />
      </td>
      <td className="px-3 py-2.5">
        <Toggle checked={model.enabled} disabled={busy} onChange={onToggle} label={`Enable ${model.model}`} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <HealthBadge health={model.health} />
          {dirty && (
            <button
              type="button"
              disabled={busy}
              onClick={onClearHealth}
              className="rounded-md border border-axon-border px-2 py-0.5 text-[11px] text-axon-muted transition hover:border-axon-gold/50 hover:text-axon-gold disabled:opacity-40"
            >
              Clear
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Route card ─────────────────────────────────────────────────────────────

function RouteCard({
  route,
  busyKeys,
  onToggleRoute,
  onClearRouteHealth,
  onToggleModel,
  onModelPriority,
  onClearModelHealth,
}: {
  route: RouterRoute;
  busyKeys: Set<string>;
  onToggleRoute: (enabled: boolean) => void;
  onClearRouteHealth: () => void;
  onToggleModel: (modelId: string, enabled: boolean) => void;
  onModelPriority: (modelId: string, priority: number) => void;
  onClearModelHealth: (model: string) => void;
}) {
  const routeBusy = busyKeys.has(`route:${route.id}`);
  const models = [...route.models].sort((a, b) => b.tier_rank - a.tier_rank || a.priority - b.priority);
  const routeDirty = route.health && route.health.status !== 'healthy';

  return (
    <section className={`rounded-xl border border-axon-border bg-axon-surface p-4 ${route.enabled ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">{route.name}</h2>
            <span className="rounded-full bg-axon-elevated px-2 py-0.5 text-[11px] text-axon-muted">{route.kind}</span>
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-axon-muted">
            {route.secret_key ?? 'no key (subscription/local)'}
            {route.base_url ? ` · ${route.base_url}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Route-wide health — a dead key here kills every model behind it. */}
          <div className="flex items-center gap-2">
            <HealthBadge health={route.health} />
            {routeDirty && (
              <button
                type="button"
                disabled={routeBusy}
                onClick={onClearRouteHealth}
                className="rounded-md border border-axon-border px-2 py-0.5 text-[11px] text-axon-muted transition hover:border-axon-gold/50 hover:text-axon-gold disabled:opacity-40"
              >
                Clear
              </button>
            )}
          </div>
          <Toggle
            checked={route.enabled}
            disabled={routeBusy}
            onChange={onToggleRoute}
            label={`Enable route ${route.name}`}
          />
        </div>
      </div>

      {models.length === 0 ? (
        <p className="mt-4 text-xs text-axon-muted">No models registered for this route.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-axon-border/60">
          <table className="w-full text-left text-sm">
            <thead className="bg-axon-elevated text-[11px] uppercase tracking-wider text-axon-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <ModelRow
                  key={m.id}
                  routeId={route.id}
                  routeEnabled={route.enabled}
                  model={m}
                  busy={busyKeys.has(`model:${m.id}`)}
                  onToggle={(enabled) => onToggleModel(m.id, enabled)}
                  onPriority={(priority) => onModelPriority(m.id, priority)}
                  onClearHealth={() => onClearModelHealth(m.model)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function RouterTool() {
  const [routes, setRoutes] = useState<RouterRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(ROUTER_API);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setRoutes(data.routes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(key: string, body: Record<string, unknown>, successMsg: string) {
    setBusyKeys((prev) => new Set(prev).add(key));
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(ROUTER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'update failed');
      setMessage(successMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed');
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const totalModels = routes.reduce((n, r) => n + r.models.length, 0);
  const deadCount = routes.reduce(
    (n, r) =>
      n +
      (r.health?.status === 'dead' ? 1 : 0) +
      r.models.filter((m) => m.health?.status === 'dead').length,
    0,
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-axon-muted">AXON · Router</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Router Control</h1>
        <p className="mt-1 max-w-2xl text-sm text-axon-muted">
          Every route and model the AXON walker can pick from, with live health. Enable or disable a
          route or model, change priority, or clear a route/model marked{' '}
          <span className="text-axon-danger">dead</span> to bring it back into rotation.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-xs text-axon-muted">
        <span>{routes.length} route{routes.length === 1 ? '' : 's'}</span>
        <span>{totalModels} model{totalModels === 1 ? '' : 's'}</span>
        {deadCount > 0 && <span className="text-axon-danger">{deadCount} dead</span>}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto text-axon-muted transition hover:text-axon-text disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : '↺ Refresh'}
        </button>
      </div>

      {message && (
        <p className="rounded-lg border border-axon-success/30 bg-axon-success/10 px-3 py-2 text-xs text-axon-success">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-axon-danger/30 bg-axon-danger/10 px-3 py-2 text-xs text-axon-danger">
          {error}
        </p>
      )}

      {loading && routes.length === 0 ? (
        <p className="py-8 text-center text-sm text-axon-muted">Loading routes…</p>
      ) : routes.length === 0 ? (
        <p className="py-8 text-center text-sm text-axon-muted">No routes configured yet.</p>
      ) : (
        <div className="space-y-4">
          {routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              busyKeys={busyKeys}
              onToggleRoute={(enabled) =>
                runAction(
                  `route:${route.id}`,
                  { action: 'toggle_route', routeId: route.id, enabled },
                  enabled ? `${route.name} enabled.` : `${route.name} disabled.`,
                )
              }
              onClearRouteHealth={() =>
                runAction(
                  `route:${route.id}`,
                  { action: 'clear_health', routeId: route.id, model: '' },
                  `${route.name} health cleared.`,
                )
              }
              onToggleModel={(modelId, enabled) =>
                runAction(
                  `model:${modelId}`,
                  { action: 'toggle_model', modelId, enabled },
                  enabled ? 'Model enabled.' : 'Model disabled.',
                )
              }
              onModelPriority={(modelId, priority) =>
                runAction(`model:${modelId}`, { action: 'set_priority', modelId, priority }, 'Priority updated.')
              }
              onClearModelHealth={(model) =>
                runAction(
                  `model:${route.models.find((m) => m.model === model)?.id ?? model}`,
                  { action: 'clear_health', routeId: route.id, model },
                  'Health cleared.',
                )
              }
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-axon-muted">
        Tiers, high to low: {TIER_ORDER.map((t) => TIER_LABEL[t]).join(' → ')}.
      </p>

      <AxonToolFooter toolSlug="router" />
    </div>
  );
}
