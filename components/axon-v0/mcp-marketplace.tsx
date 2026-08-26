'use client';

import { useState } from 'react';

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

export function McpMarketplace() {
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setRequested((r) => ({ ...r, [id]: !r[id] }));

  return (
    <>
      <div className="sk-section-label">
        MCP Marketplace<span className="sk-count">{CATALOG.length}</span>
      </div>
      <p className="sk-market-note">
        Curated MCP servers. Request one to flag it — install and credentials come later.
      </p>
      <div className="sk-grid">
        {CATALOG.map((c) => {
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
