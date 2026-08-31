'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
}

// Curated static catalog — well-known MCP servers. No network, no secrets.
const CATALOG: CatalogEntry[] = [
  { id: 'github', name: 'GitHub', description: 'Repos, issues, pull requests, and Actions.', category: 'Dev' },
  { id: 'supabase', name: 'Supabase', description: 'Postgres queries, migrations, and edge functions.', category: 'Data' },
  { id: 'slack', name: 'Slack', description: 'Read channels, post messages, and search history.', category: 'Comms' },
  { id: 'google-drive', name: 'Google Drive', description: 'Search, read, and share documents and files.', category: 'Docs' },
  { id: 'notion', name: 'Notion', description: 'Pages, databases, and workspace search.', category: 'Docs' },
  { id: 'stripe', name: 'Stripe', description: 'Payments, payouts, customers, and balances.', category: 'Finance' },
  { id: 'linear', name: 'Linear', description: 'Issues, projects, and cycle planning.', category: 'Dev' },
  { id: 'playwright', name: 'Playwright', description: 'Drive a real browser for tests and scraping.', category: 'Automation' },
];

// Problem #9 (MCP build system) starts with Supabase — the one catalog entry
// below with a real "Connect" flow (app/api/axon-v0/mcp/supabase/route.ts)
// instead of the local-only "Request" flag every other entry still uses.
const WIRED_ID = 'supabase';

type SupabaseState = {
  connected: boolean;
  label: string;
  detail: string;
} | null;

function SupabaseCard({ c, onConnected }: { c: CatalogEntry; onConnected?: () => void }) {
  const [state, setState] = useState<SupabaseState>(null);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refresh = () => {
    setChecking(true);
    fetch(apiUrl('/api/axon-v0/mcp/supabase'))
      .then((r) => r.json())
      .then((d) => setState(d && typeof d.label === 'string' ? d : null))
      .catch(() => setState(null))
      .finally(() => setChecking(false));
  };

  useEffect(refresh, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/mcp/supabase'), { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setState(d && typeof d.label === 'string' ? d : null);
      if (d && d.connected) onConnected?.();
    } catch {
      setState({ connected: false, label: 'Could not connect right now', detail: 'Nothing was saved.' });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="sk-card v0-panel">
      <div className="sk-card-head">
        <span className="sk-name">{c.name}</span>
        <span className="v0-chip">{c.category}</span>
      </div>
      <p className="sk-desc">{c.description}</p>
      <div className="sk-meta">
        <span className={`sk-state ${state?.connected ? 'sk-state-on' : ''}`}>
          <span className="sk-state-dot" />
          {checking ? 'Checking…' : state?.label || 'Status unknown'}
        </span>
      </div>
      {state && !checking && <p className="sk-market-hint">{state.detail}</p>}
      <div className="sk-meta">
        <button
          onClick={connect}
          disabled={checking || connecting}
          className={`sk-market-btn ${state?.connected ? 'sk-market-btn-on' : ''}`}
        >
          {connecting ? 'Connecting…' : state?.connected ? '✓ Connected' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

export function McpMarketplace({ onConnected }: { onConnected?: () => void }) {
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setRequested((r) => ({ ...r, [id]: !r[id] }));

  return (
    <>
      <div className="sk-section-label">
        MCP Marketplace<span className="sk-count">{CATALOG.length}</span>
      </div>
      <p className="sk-market-note">
        Curated MCP servers. Supabase connects live below — everything else, request one to flag it; install and credentials come later.
      </p>
      <div className="sk-grid">
        {CATALOG.map((c) => {
          if (c.id === WIRED_ID) {
            return <SupabaseCard key={c.id} c={c} onConnected={onConnected} />;
          }
          const isReq = !!requested[c.id];
          return (
            <div key={c.id} className="sk-card v0-panel">
              <div className="sk-card-head">
                <span className="sk-name">{c.name}</span>
                <span className="v0-chip">{c.category}</span>
              </div>
              <p className="sk-desc">{c.description}</p>
              <div className="sk-meta">
                <button
                  onClick={() => toggle(c.id)}
                  className={`sk-market-btn ${isReq ? 'sk-market-btn-on' : ''}`}
                  aria-pressed={isReq}
                >
                  {isReq ? '✓ Requested' : '＋ Request'}
                </button>
                {isReq && <span className="sk-market-hint">Install comes later</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
