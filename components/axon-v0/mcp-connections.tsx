'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './connector-catalog.css';

// Real MCP (Model Context Protocol) server connections — problem #9's general MCP path.
// Visual style deliberately reuses components/axon-v0/connector-catalog.css (cc-* classes)
// rather than a new stylesheet, per the task's "match its visual style, keep it simple."
//
// "Paste it, it's encrypted, it works immediately" — same pattern
// lib/axon-account-keys.mjs already established for provider keys. Adding a server here
// saves it AES-256-GCM encrypted (app/api/axon-v0/mcp/connections) and immediately attempts
// a real handshake, so the card's status reflects reality the moment you press Add — never a
// "request" that waits on manual follow-up.

type Transport = 'http' | 'sse' | 'stdio';
type AuthType = 'none' | 'bearer' | 'api_key' | 'basic';
type Status = 'pending' | 'connected' | 'error';

interface McpConnection {
  id: string;
  name: string;
  transport: Transport;
  serverUrl: string | null;
  command: string | null;
  authType: AuthType;
  headerName: string | null;
  hasCredential: boolean;
  credentialLast4: string | null;
  status: Status;
  lastCheckedAt: string | null;
  lastError: string | null;
  serverInfo: { name?: string; version?: string } & Record<string, unknown>;
}

const TRANSPORT_OPTIONS: { value: Transport; label: string; live: boolean }[] = [
  { value: 'http', label: 'HTTP (Streamable) — live check', live: true },
  { value: 'sse', label: 'SSE (legacy) — stored only, follow-up', live: false },
  { value: 'stdio', label: 'stdio (local command) — stored only, follow-up', live: false },
];

const AUTH_OPTIONS: { value: AuthType; label: string; needsHeaderName: boolean }[] = [
  { value: 'none', label: 'No auth', needsHeaderName: false },
  { value: 'bearer', label: 'Bearer token', needsHeaderName: false },
  { value: 'api_key', label: 'API key (custom header)', needsHeaderName: true },
  { value: 'basic', label: 'Basic (username:password)', needsHeaderName: false },
];

function statusBadge(c: McpConnection) {
  if (c.status === 'connected') return <span className="cc-badge cc-badge-connected">Connected</span>;
  if (c.status === 'error') return <span className="cc-badge cc-badge-disconnected">Error</span>;
  return <span className="cc-badge cc-badge-disconnected">Pending</span>;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function McpConnections({ onChanged }: { onChanged?: () => void } = {}) {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<Transport>('http');
  const [serverUrl, setServerUrl] = useState('');
  const [command, setCommand] = useState('');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [headerName, setHeaderName] = useState('');
  const [credential, setCredential] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/mcp/connections'))
      .then((r) => r.json())
      .then((d) => {
        setConnections(Array.isArray(d.connections) ? d.connections : []);
        setError('');
      })
      .catch(() => setError('Could not load MCP connections.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  const authMeta = AUTH_OPTIONS.find((a) => a.value === authType) || AUTH_OPTIONS[0];
  const transportMeta = TRANSPORT_OPTIONS.find((t) => t.value === transport) || TRANSPORT_OPTIONS[0];

  function resetForm() {
    setName('');
    setTransport('http');
    setServerUrl('');
    setCommand('');
    setAuthType('none');
    setHeaderName('');
    setCredential('');
    setAddError('');
  }

  async function addConnection() {
    setAddError('');
    if (!name.trim()) return setAddError('Give this connection a name.');
    if ((transport === 'http' || transport === 'sse') && !serverUrl.trim()) {
      return setAddError('This transport needs a server URL.');
    }
    if (transport === 'stdio' && !command.trim()) {
      return setAddError('This transport needs a command.');
    }
    if (authType !== 'none' && !credential.trim()) {
      return setAddError('This auth type needs a credential.');
    }

    setAddBusy(true);
    setNote('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/mcp/connections'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          transport,
          serverUrl: serverUrl.trim() || undefined,
          command: command.trim() || undefined,
          authType,
          headerName: headerName.trim() || undefined,
          credential: credential.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.reason || 'Could not save that connection.');
      setNote(d.verified ? `${name.trim()} connected — handshake succeeded.` : `${name.trim()} saved, but the live check failed: ${d.reason || 'unknown reason'}`);
      resetForm();
      setAddOpen(false);
      load();
      onChanged?.();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not save that connection.');
    } finally {
      setAddBusy(false);
    }
  }

  async function reverify(c: McpConnection) {
    setBusyId(c.id);
    setNote('');
    setError('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/mcp/connections'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, reverify: true }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.reason || 'Could not re-check that connection.');
      setNote(d.verified ? `${c.name}: handshake succeeded.` : `${c.name}: handshake failed — ${d.reason || 'unknown reason'}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not re-check that connection.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: McpConnection) {
    setBusyId(c.id);
    setNote('');
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/axon-v0/mcp/connections?id=${encodeURIComponent(c.id)}`), {
        method: 'DELETE',
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.reason || 'Could not remove that connection.');
      setNote(`${c.name} removed.`);
      load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that connection.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="sk-section-label">
        MCP Connections<span className="sk-count">{connections.length}</span>
      </div>
      <p className="cc-hint">
        Paste in an MCP server&apos;s connection details — it&apos;s encrypted and an AXON
        agent can reach it right away. HTTP (Streamable) servers get a real live handshake
        below; SSE and stdio are stored but their live check is a flagged follow-up (see the
        PR notes).
      </p>

      {!loaded ? (
        <p className="cc-hint">Loading…</p>
      ) : (
        <>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {note && <p className="cc-save-note">{note}</p>}

          {connections.length > 0 && (
            <div className="cc-vendor-cards">
              {connections.map((c) => {
                const isBusy = busyId === c.id;
                return (
                  <div key={c.id} className={`cc-card ${c.status === 'connected' ? 'cc-connected' : ''}`}>
                    <div className="cc-card-top">
                      <div className="cc-card-title">
                        <span className="cc-card-name">{c.name}</span>
                        <span className="cc-card-kind">
                          {c.transport} · {c.authType === 'none' ? 'no auth' : c.authType}
                        </span>
                      </div>
                    </div>

                    <div className="cc-status-row">
                      {statusBadge(c)}
                      {c.hasCredential && <span className="cc-badge cc-badge-free">•••• {c.credentialLast4}</span>}
                    </div>

                    {c.serverUrl && <p className="cc-reason">{c.serverUrl}</p>}
                    {c.command && <p className="cc-reason">$ {c.command}</p>}
                    {c.status === 'connected' && c.serverInfo?.name && (
                      <p className="cc-reason">
                        Reports itself as {c.serverInfo.name}
                        {c.serverInfo.version ? ` v${c.serverInfo.version}` : ''}.
                      </p>
                    )}
                    {c.status === 'error' && c.lastError && <p className="cc-reason">{c.lastError}</p>}
                    {relativeTime(c.lastCheckedAt) && <p className="cc-reason">Checked {relativeTime(c.lastCheckedAt)}</p>}

                    <div className="cc-actions">
                      <button type="button" className="cc-btn" disabled={isBusy} onClick={() => reverify(c)}>
                        {isBusy ? '…' : 'Verify'}
                      </button>
                      <button type="button" className="cc-btn cc-btn-disconnect" disabled={isBusy} onClick={() => remove(c)}>
                        {isBusy ? '…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cc-add-own">
            {!addOpen ? (
              <div className="cc-add-banner">
                <div>
                  <p className="cc-add-banner-title">Connect an MCP server</p>
                  <p className="cc-add-banner-desc">Paste its URL and auth — no request, no waiting.</p>
                </div>
                <button type="button" className="cc-btn cc-btn-add" onClick={() => setAddOpen(true)}>
                  + Add MCP Server
                </button>
              </div>
            ) : (
              <div className="cc-add-form">
                <div className="cc-add-header">
                  <p className="cc-add-title">Add MCP Server</p>
                  <button
                    type="button"
                    className="cc-add-close"
                    onClick={() => {
                      setAddOpen(false);
                      resetForm();
                    }}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <label className="cc-add-label" htmlFor="mcp-add-name">
                  Name
                </label>
                <input
                  id="mcp-add-name"
                  className="cc-add-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Notion MCP"
                />

                <label className="cc-add-label" htmlFor="mcp-add-transport">
                  Transport
                </label>
                <select
                  id="mcp-add-transport"
                  className="cc-add-input"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value as Transport)}
                >
                  {TRANSPORT_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                {transport === 'stdio' ? (
                  <>
                    <label className="cc-add-label" htmlFor="mcp-add-command">
                      Command
                    </label>
                    <input
                      id="mcp-add-command"
                      className="cc-add-input"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="e.g. npx -y @some/mcp-server"
                    />
                  </>
                ) : (
                  <>
                    <label className="cc-add-label" htmlFor="mcp-add-url">
                      Server URL
                    </label>
                    <input
                      id="mcp-add-url"
                      className="cc-add-input"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </>
                )}

                <label className="cc-add-label" htmlFor="mcp-add-auth">
                  Auth
                </label>
                <select
                  id="mcp-add-auth"
                  className="cc-add-input"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                >
                  {AUTH_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>

                {authMeta.needsHeaderName && (
                  <>
                    <label className="cc-add-label" htmlFor="mcp-add-header">
                      Header name (optional — defaults to X-Api-Key)
                    </label>
                    <input
                      id="mcp-add-header"
                      className="cc-add-input"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="X-Api-Key"
                    />
                  </>
                )}

                {authType !== 'none' && (
                  <>
                    <label className="cc-add-label" htmlFor="mcp-add-credential">
                      {authType === 'basic' ? 'Credential (username:password)' : 'Credential'}
                    </label>
                    <input
                      id="mcp-add-credential"
                      type="password"
                      className="cc-add-input"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder={authType === 'basic' ? 'username:password' : 'Paste the token or key'}
                      autoComplete="off"
                    />
                    <p className="cc-hint">
                      Stored AES-256-GCM encrypted. Nothing here is ever returned to this page again — only
                      the last 4 characters, to confirm which credential is on file.
                    </p>
                  </>
                )}

                {!transportMeta.live && (
                  <p className="cc-hint">
                    This transport is saved, but the live handshake below only runs for HTTP
                    (Streamable) servers today — see the PR notes for the follow-up.
                  </p>
                )}

                {addError && <p className="cc-add-error">{addError}</p>}

                <div className="cc-actions">
                  <button type="button" className="cc-btn" disabled={addBusy} onClick={addConnection}>
                    {addBusy ? 'Adding…' : 'Add & Verify'}
                  </button>
                  <button
                    type="button"
                    className="cc-btn cc-btn-disconnect"
                    disabled={addBusy}
                    onClick={() => {
                      setAddOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default McpConnections;
