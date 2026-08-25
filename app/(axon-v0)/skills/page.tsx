'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import '@/components/axon-v0/skills.css';

interface Skill {
  id: string;
  name: string;
  description?: string;
  category?: string;
  source?: string;
  enabled?: boolean;
}

// Slug/snake names -> Title Case ("nvg-operator-core" -> "Nvg Operator Core").
function titleCase(raw: string): string {
  return String(raw || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Sentence case: capitalize the first letter, leave the rest (proper nouns) intact.
function sentenceCase(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isMcp(s: Skill): boolean {
  const hay = `${s.category || ''} ${s.source || ''} ${s.name || ''}`.toLowerCase();
  return /\bmcp\b|mcp[-_ ]|server/.test(hay);
}

function SkillCard({ s }: { s: Skill }) {
  const golden = (s.source || '').toLowerCase() === 'golden';
  return (
    <div className="sk-card v0-panel">
      <div className="sk-card-head">
        <span className="sk-name">{titleCase(s.name)}</span>
        <span className={`sk-state ${s.enabled ? 'sk-state-on' : ''}`}>
          <span className="sk-state-dot" />
          {s.enabled === false ? 'Off' : s.enabled ? 'On' : '—'}
        </span>
      </div>
      {s.description && <p className="sk-desc">{sentenceCase(s.description)}</p>}
      <div className="sk-meta">
        {s.category && <span className="v0-chip">{s.category}</span>}
        {golden && <span className="v0-chip sk-gold">Golden</span>}
        {s.source && !golden && <span className="v0-chip">{s.source}</span>}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetch(apiUrl('/api/axon-v0/skills'))
      .then((r) => r.json())
      .then((d) => {
        if (live) setSkills(Array.isArray(d.skills) ? d.skills : []);
      })
      .catch(() => {
        if (live) setSkills([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const mcp = skills.filter(isMcp);
  const plainSkills = skills.filter((s) => !isMcp(s));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl tracking-[0.14em]">SKILLS &amp; MCP</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every skill and MCP server registered to your account, read live from NI-Brain.
      </p>

      {loading ? (
        <div className="v0-panel sk-empty mt-6">Loading skills…</div>
      ) : skills.length === 0 ? (
        <div className="v0-panel sk-empty mt-6">No skills registered yet.</div>
      ) : (
        <>
          <div className="sk-section-label">
            Skills<span className="sk-count">{plainSkills.length}</span>
          </div>
          {plainSkills.length === 0 ? (
            <div className="v0-panel sk-empty">No skills registered yet.</div>
          ) : (
            <div className="sk-grid">
              {plainSkills.map((s) => (
                <SkillCard key={s.id} s={s} />
              ))}
            </div>
          )}

          {mcp.length > 0 && (
            <>
              <div className="sk-section-label">
                MCP Servers<span className="sk-count">{mcp.length}</span>
              </div>
              <div className="sk-grid">
                {mcp.map((s) => (
                  <SkillCard key={s.id} s={s} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
