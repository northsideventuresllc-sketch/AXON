'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './connector-catalog.css';

interface CatalogModel {
  laneId: string;
  model: string;
  costTier: 0 | 1 | 2 | 3;
  capabilities: string[];
  isSafetyNet: boolean;
}

interface CatalogConnector {
  routeId: string;
  name: string;
  vendor: string;
  connectorKind: 'api' | 'subscription' | 'local';
  cliCommand: string | null;
  authScope: string | null;
  status: 'connected' | 'disconnected';
  sortOrder: number;
  enabled: boolean;
  secretKeyName: string | null;
  models: CatalogModel[];
  available: boolean;
  unavailableReason: string | null;
}

const KIND_LABEL: Record<CatalogConnector['connectorKind'], string> = {
  api: 'API Key',
  subscription: 'Subscription',
  local: 'Local',
};

// Vendor slugs are whatever comes before the first "-" in a route name (e.g.
// "claude" out of "claude-subscription"). Title-case it for display only.
function vendorLabel(vendor: string): string {
  if (!vendor) return 'Other';
  return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

function connectLabel(kind: CatalogConnector['connectorKind']): string {
  if (kind === 'subscription') return 'Mark Signed In';
  if (kind === 'local') return 'Turn On';
  return 'Connect';
}

export function ConnectorCatalog() {
  const [connectors, setConnectors] = useState<CatalogConnector[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/router/catalog'))
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const list: CatalogConnector[] = d.connectors || [];
        setConnectors(list.slice().sort((a, b) => a.sortOrder - b.sortOrder));
        setError('');
      })
      .catch(() => setError('Could not load the connector catalog.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  const groups = useMemo(() => {
    const byVendor = new Map<string, CatalogConnector[]>();
    for (const c of connectors) {
      const list = byVendor.get(c.vendor) || [];
      list.push(c);
      byVendor.set(c.vendor, list);
    }
    return Array.from(byVendor.entries());
  }, [connectors]);

  async function persistOrder(next: CatalogConnector[]) {
    setConnectors(next);
    await fetch(apiUrl('/api/axon-v0/router/order'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map((c) => c.routeId) }),
    }).catch(() => setError('Order changed here, but did not save. Try again.'));
  }

  function onDrop(targetId: string) {
    setOverId(null);
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const from = connectors.findIndex((c) => c.routeId === dragId);
    const to = connectors.findIndex((c) => c.routeId === targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    const next = connectors.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  }

  async function connect(c: CatalogConnector) {
    if (!c.available || busy) return;
    setBusy(c.routeId);
    setNote('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/router/order'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connect: {
            routeId: c.routeId,
            connectorKind: c.connectorKind,
            status: 'connected',
            secretKey: c.secretKeyName,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not connect that provider.');
      setNote(`${c.name} connected.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect that provider.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(c: CatalogConnector) {
    if (busy) return;
    setBusy(c.routeId);
    setNote('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/router/order'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connect: { routeId: c.routeId, connectorKind: c.connectorKind, status: 'disconnected' },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not disconnect that provider.');
      setNote(`${c.name} disconnected.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect that provider.');
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return <p className="cc-hint">Loading connectors…</p>;
  }

  return (
    <div className="space-y-5">
      <p className="cc-hint">
        Drag a card to change how AXON prefers it in auto mode. A vendor&apos;s subscription and API
        connectors can both be on at once — they run as two separate lanes.
      </p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {note && <p className="cc-save-note">{note}</p>}

      {groups.map(([vendor, cards]) => (
        <div key={vendor} className="cc-vendor-group">
          <p className="cc-vendor-name">{vendorLabel(vendor)}</p>
          <div className="cc-vendor-cards">
            {cards.map((c) => {
              const isBusy = busy === c.routeId;
              const freeModels = c.models.filter((m) => m.costTier === 0);
              const hasSafetyNet = c.models.some((m) => m.isSafetyNet);
              return (
                <div
                  key={c.routeId}
                  draggable={c.available}
                  onDragStart={() => c.available && setDragId(c.routeId)}
                  onDragOver={(e) => {
                    if (!c.available) return;
                    e.preventDefault();
                    if (overId !== c.routeId) setOverId(c.routeId);
                  }}
                  onDragLeave={() => setOverId((id) => (id === c.routeId ? null : id))}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(c.routeId);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={[
                    'cc-card',
                    c.status === 'connected' ? 'cc-connected' : '',
                    dragId === c.routeId ? 'cc-dragging' : '',
                    overId === c.routeId && dragId && dragId !== c.routeId ? 'cc-drop-target' : '',
                    !c.available ? 'cc-unavailable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={c.unavailableReason || undefined}
                >
                  <div className="cc-card-top">
                    <div className="cc-card-title">
                      <span className="cc-card-name">{c.name.replace(/-/g, ' ')}</span>
                      <span className="cc-card-kind">{KIND_LABEL[c.connectorKind]}</span>
                    </div>
                    {c.available && <span className="cc-drag-handle" aria-hidden>⠿</span>}
                  </div>

                  <div className="cc-status-row">
                    {c.status === 'connected' ? (
                      <span className="cc-badge cc-badge-connected">Connected</span>
                    ) : (
                      <span className="cc-badge cc-badge-disconnected">Not Connected</span>
                    )}
                    {freeModels.length > 0 && <span className="cc-badge cc-badge-free">Free</span>}
                    {hasSafetyNet && <span className="cc-badge cc-badge-safetynet">Last-Resort Floor</span>}
                  </div>

                  {c.models.length > 0 && (
                    <div className="cc-models">
                      {c.models.map((m) => (
                        <span key={m.laneId} className="cc-model-chip">
                          {m.model}
                        </span>
                      ))}
                    </div>
                  )}

                  {!c.available && c.unavailableReason && <p className="cc-reason">{c.unavailableReason}</p>}
                  {c.available && c.connectorKind === 'subscription' && c.authScope && (
                    <p className="cc-reason">{c.authScope}</p>
                  )}

                  {c.available && (
                    <div className="cc-actions">
                      {c.status === 'connected' ? (
                        <button
                          type="button"
                          className="cc-btn cc-btn-disconnect"
                          disabled={isBusy}
                          onClick={() => disconnect(c)}
                        >
                          {isBusy ? '…' : 'Disconnect'}
                        </button>
                      ) : (
                        <button type="button" className="cc-btn" disabled={isBusy} onClick={() => connect(c)}>
                          {isBusy ? '…' : connectLabel(c.connectorKind)}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {connectors.length === 0 && <p className="cc-hint">No connectors in the catalog yet.</p>}
    </div>
  );
}

export default ConnectorCatalog;
