'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './connector-catalog.css';

/** The four lane kinds the router core understands. */
type CustomLaneKind = 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama';

const KIND_OPTIONS: { value: CustomLaneKind; label: string; needsEndpoint: boolean }[] = [
  { value: 'openai-compatible', label: 'OpenAI-compatible', needsEndpoint: true },
  { value: 'anthropic', label: 'Anthropic', needsEndpoint: false },
  { value: 'gemini', label: 'Gemini', needsEndpoint: false },
  { value: 'ollama', label: 'Ollama (runs locally)', needsEndpoint: true },
];

const SECRET_VALUE_PREFIXES = [
  'sk-',
  'sk_',
  'pk_live',
  'pk_test',
  'ghp_',
  'gho_',
  'github_pat_',
  'AIza',
  'xox',
  'eyJ',
  'Bearer ',
];

/** A key NAME reads like OPENAI_API_KEY_PERSONAL — short, upper-case words joined by _ or -. */
function looksLikeAKeyName(v: string): boolean {
  return /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/.test(v) && v.length <= 60;
}

/** Best-effort guard against someone pasting the actual secret instead of its name. */
function looksLikeSecretValue(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (looksLikeAKeyName(v)) return false;
  if (SECRET_VALUE_PREFIXES.some((p) => v.startsWith(p))) return true;
  if (v.length > 40) return true;
  return false;
}

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

export function ConnectorCatalog({ onChanged }: { onChanged?: () => void } = {}) {
  const [connectors, setConnectors] = useState<CatalogConnector[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Add Your Own — a lane outside the fixed catalog above.
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addKind, setAddKind] = useState<CustomLaneKind>('openai-compatible');
  const [addEndpoint, setAddEndpoint] = useState('');
  const [addModel, setAddModel] = useState('');
  const [addSecretName, setAddSecretName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

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
      onChanged?.();
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
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect that provider.');
    } finally {
      setBusy(null);
    }
  }

  const addKindMeta = KIND_OPTIONS.find((k) => k.value === addKind) || KIND_OPTIONS[0];

  function resetAddForm() {
    setAddLabel('');
    setAddKind('openai-compatible');
    setAddEndpoint('');
    setAddModel('');
    setAddSecretName('');
    setAddError('');
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      /* copy failed, silent */
    }
  }

  async function submitCustomLane() {
    setAddError('');
    const label = addLabel.trim();
    const model = addModel.trim();
    const endpoint = addEndpoint.trim();
    const secretName = addSecretName.trim();

    if (!label) {
      setAddError('Give this lane a name.');
      return;
    }
    if (!model) {
      setAddError('Enter the model id.');
      return;
    }
    if (addKindMeta.needsEndpoint && !endpoint) {
      setAddError('This kind needs an endpoint URL.');
      return;
    }
    if (secretName && looksLikeSecretValue(secretName)) {
      setAddError(
        'That looks like the secret itself, not its name. Enter the NAME of the key as it is saved in your secrets — never paste the key.',
      );
      return;
    }

    setAddBusy(true);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/providers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          kind: addKind,
          base_url: endpoint || undefined,
          model,
          secret_key: secretName || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not add that lane.');
      setNote(`${label} added to the catalog.`);
      resetAddForm();
      setAddOpen(false);
      load();
      onChanged?.();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add that lane.');
    } finally {
      setAddBusy(false);
    }
  }

  if (!loaded) {
    return <p className="cc-hint">Loading connectors…</p>;
  }

  return (
    <div className="space-y-5">
      <p className="cc-hint">
        <strong>Drag cards to change the order</strong> — AXON tries each lane from top to bottom in auto mode. When a vendor has both subscription and API
        connectors on, they run as two separate lanes in the order you set here.
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
                    {c.available && (
                      <div className="cc-drag-hint" title="Drag to reorder">
                        <span className="cc-drag-handle" aria-hidden>⋮⋮</span>
                      </div>
                    )}
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
                  {c.available && c.connectorKind === 'subscription' && c.cliCommand && (
                    <div className="cc-cli-block">
                      <p className="cc-cli-label">Run this on the Mac mini:</p>
                      <div className="cc-cli-code-wrapper">
                        <code className="cc-cli-code">{c.cliCommand}</code>
                        <button
                          type="button"
                          className="cc-cli-copy"
                          onClick={() => copyToClipboard(c.cliCommand || '', c.routeId)}
                          title="Copy command"
                        >
                          {copied === c.routeId ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="cc-cli-hint">Then come back and mark it signed in.</p>
                    </div>
                  )}
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
                        <button
                          type="button"
                          className={`cc-btn ${c.connectorKind === 'subscription' ? 'cc-btn-secondary' : ''}`}
                          disabled={isBusy}
                          onClick={() => connect(c)}
                        >
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

      <div className="cc-add-own">
        {!addOpen ? (
          <div className="cc-add-banner">
            <div>
              <p className="cc-add-banner-title">Need a custom lane?</p>
              <p className="cc-add-banner-desc">Register a model server or API that is not in the catalog above.</p>
            </div>
            <button type="button" className="cc-btn cc-btn-add" onClick={() => setAddOpen(true)}>
              + Add Your Own
            </button>
          </div>
        ) : (
          <div className="cc-add-form">
            <div className="cc-add-header">
              <p className="cc-add-title">Add Your Own</p>
              <button
                type="button"
                className="cc-add-close"
                onClick={() => {
                  setAddOpen(false);
                  resetAddForm();
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cc-hint">
              Register a lane outside the catalog above. It joins the Omni router and can be picked for any
              agent once saved.
            </p>

            <label className="cc-add-label" htmlFor="cc-add-name">
              Name
            </label>
            <input
              id="cc-add-name"
              className="cc-add-input"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="e.g. My Home Server"
            />

            <label className="cc-add-label" htmlFor="cc-add-kind">
              Kind
            </label>
            <select
              id="cc-add-kind"
              className="cc-add-input"
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as CustomLaneKind)}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>

            <label className="cc-add-label" htmlFor="cc-add-endpoint">
              Endpoint URL{addKindMeta.needsEndpoint ? '' : ' (optional)'}
            </label>
            <input
              id="cc-add-endpoint"
              className="cc-add-input"
              value={addEndpoint}
              onChange={(e) => setAddEndpoint(e.target.value)}
              placeholder="https://…"
            />

            <label className="cc-add-label" htmlFor="cc-add-model">
              Model id
            </label>
            <input
              id="cc-add-model"
              className="cc-add-input"
              value={addModel}
              onChange={(e) => setAddModel(e.target.value)}
              placeholder="e.g. llama3.1:8b"
            />

            <label className="cc-add-label" htmlFor="cc-add-secret">
              Name of the secret key (optional)
            </label>
            <input
              id="cc-add-secret"
              className="cc-add-input"
              value={addSecretName}
              onChange={(e) => setAddSecretName(e.target.value)}
              placeholder="e.g. MY_SERVER_API_KEY"
              autoComplete="off"
            />
            <p className="cc-hint">
              This is the NAME of a key already saved in your secrets — never the key itself. AXON looks it
              up by name when it needs to connect.
            </p>

            {addError && <p className="cc-add-error">{addError}</p>}

            <div className="cc-actions">
              <button type="button" className="cc-btn" disabled={addBusy} onClick={submitCustomLane}>
                {addBusy ? '…' : 'Add Lane'}
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-disconnect"
                disabled={addBusy}
                onClick={() => {
                  setAddOpen(false);
                  resetAddForm();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConnectorCatalog;
