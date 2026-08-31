'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import '@/components/axon-v0/skills.css';
import { SkillMcpCreator } from '@/components/axon-v0/skill-mcp-creator';
import { McpMarketplace } from '@/components/axon-v0/mcp-marketplace';

interface Skill {
  id: string;
  name: string;
  description?: string;
  category?: string;
  source?: string;
  enabled?: boolean;
  isGolden?: boolean;
}

type Filter = 'all' | 'skills' | 'mcp';

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

// The one skill nothing on screen is ever allowed to switch off — kept in sync
// with HARD_LOCKED_GOLDEN_SKILLS in lib/axon-v0/skill-guard.mjs. The server is
// the real enforcement; this is just so the button never invites the click.
const HARD_LOCKED = new Set(['obsidian-vault-write']);

type ToggleState = 'idle' | 'busy' | { blocked: string; requiresConfirm: boolean };

function SkillCard({
  s,
  open,
  onToggle,
  toggleState,
  onSetEnabled,
}: {
  s: Skill;
  open: boolean;
  onToggle: () => void;
  toggleState: ToggleState;
  onSetEnabled: (enabled: boolean, confirmGolden?: boolean) => void;
}) {
  const golden = (s.source || '').toLowerCase() === 'golden' || !!s.isGolden;
  const hardLocked = HARD_LOCKED.has(String(s.name || '').toLowerCase());
  const busy = toggleState === 'busy';
  const blockedMsg = typeof toggleState === 'object' ? toggleState.blocked : undefined;
  const requiresConfirm = typeof toggleState === 'object' ? toggleState.requiresConfirm : false;

  return (
    <div className={`sk-card v0-panel ${golden ? 'sk-card-golden' : ''}`}>
      <button
        type="button"
        className="sk-card-head sk-card-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="sk-name">
          {golden && (
            <span className="sk-lock" title="Golden skill — loads on every agent boot" aria-hidden="true">
              🔒
            </span>
          )}
          {titleCase(s.name)}
        </span>
        <span className="sk-head-right">
          <span className={`sk-state ${s.enabled ? 'sk-state-on' : ''}`}>
            <span className="sk-state-dot" />
            {s.enabled === false ? 'Off' : s.enabled ? 'On' : '—'}
          </span>
          <span className={`sk-caret ${open ? 'sk-caret-open' : ''}`} aria-hidden="true">
            ›
          </span>
        </span>
      </button>
      {open && (
        <div className="sk-card-body">
          {s.description && <p className="sk-desc">{sentenceCase(s.description)}</p>}
          <div className="sk-meta">
            {s.category && <span className="v0-chip">{titleCase(s.category)}</span>}
            {golden && <span className="v0-chip sk-gold">Golden</span>}
            {s.source && !golden && <span className="v0-chip">{s.source}</span>}
          </div>

          <div className="sk-toggle-row">
            <button
              type="button"
              className={`sk-toggle-btn ${s.enabled ? 'sk-toggle-btn-on' : ''}`}
              disabled={busy || (hardLocked && s.enabled !== false)}
              onClick={(e) => {
                e.stopPropagation();
                onSetEnabled(!s.enabled);
              }}
              aria-pressed={!!s.enabled}
            >
              {busy ? 'Working…' : s.enabled ? 'Turn off' : 'Turn on'}
            </button>
            {hardLocked && <span className="sk-lock-hint">Can never be turned off</span>}
          </div>

          {blockedMsg && (
            <div className="sk-toggle-blocked">
              <p>{blockedMsg}</p>
              {requiresConfirm && (
                <button
                  type="button"
                  className="sk-toggle-confirm-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetEnabled(false, true);
                  }}
                >
                  Yes, turn off this golden skill
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [creator, setCreator] = useState<'skill' | 'mcp' | null>(null);
  const [toggleStates, setToggleStates] = useState<Record<string, ToggleState>>({});

  const loadSkills = () => {
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
  };

  useEffect(() => {
    setLoading(true);
    return loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOpen = (id: string) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));

  const setEnabled = async (skill: Skill, enabled: boolean, confirmGolden = false) => {
    setToggleStates((m) => ({ ...m, [skill.id]: 'busy' }));
    try {
      const res = await fetch(apiUrl('/api/axon-v0/skills'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skill.name, enabled, confirmGolden }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.ok) {
        setSkills((list) => list.map((s) => (s.id === skill.id ? { ...s, enabled } : s)));
        setToggleStates((m) => ({ ...m, [skill.id]: 'idle' }));
      } else {
        setToggleStates((m) => ({
          ...m,
          [skill.id]: {
            blocked: (d && d.reason) || 'That change was not made.',
            requiresConfirm: !!(d && d.requiresConfirm),
          },
        }));
      }
    } catch {
      setToggleStates((m) => ({
        ...m,
        [skill.id]: { blocked: 'Could not reach the skill registry — nothing was changed.', requiresConfirm: false },
      }));
    }
  };

  const q = query.trim().toLowerCase();
  const matchesSearch = (s: Skill) => !q || titleCase(s.name).toLowerCase().includes(q);

  const mcp = useMemo(
    () => skills.filter((s) => isMcp(s) && matchesSearch(s)),
    [skills, q],
  );
  const plainSkills = useMemo(
    () => skills.filter((s) => !isMcp(s) && matchesSearch(s)),
    [skills, q],
  );

  const showSkills = filter === 'all' || filter === 'skills';
  const showMcp = filter === 'all' || filter === 'mcp';
  const visibleCount = (showSkills ? plainSkills.length : 0) + (showMcp ? mcp.length : 0);

  const TOGGLES: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'skills', label: 'Skills' },
    { key: 'mcp', label: 'MCP' },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl tracking-[0.14em]">SKILLS &amp; MCP</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every skill and MCP server registered to your account, read live from NI-Brain.
      </p>

      <div className="sk-controls">
        <div className="sk-seg" role="tablist" aria-label="Filter">
          {TOGGLES.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              className={`sk-seg-btn ${filter === t.key ? 'sk-seg-btn-on' : ''}`}
              onClick={() => setFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="sk-search"
          aria-label="Search skills and MCP servers"
        />
        <div className="sk-create-row">
          <button className="sk-create-btn" onClick={() => setCreator('skill')}>
            ＋ Create Skill
          </button>
          <button className="sk-create-btn" onClick={() => setCreator('mcp')}>
            ＋ Create MCP
          </button>
        </div>
      </div>

      {loading ? (
        <div className="v0-panel sk-empty mt-6">Loading skills…</div>
      ) : skills.length === 0 ? (
        <div className="v0-panel sk-empty mt-6">No skills registered yet.</div>
      ) : (
        <>
          {showSkills && (
            <>
              <div className="sk-section-label">
                Skills<span className="sk-count">{plainSkills.length}</span>
              </div>
              {plainSkills.length === 0 ? (
                <div className="v0-panel sk-empty">
                  {q ? 'No skills match your search.' : 'No skills registered yet.'}
                </div>
              ) : (
                <div className="sk-grid">
                  {plainSkills.map((s) => (
                    <SkillCard
                      key={s.id}
                      s={s}
                      open={!!openMap[s.id]}
                      onToggle={() => toggleOpen(s.id)}
                      toggleState={toggleStates[s.id] || 'idle'}
                      onSetEnabled={(enabled, confirmGolden) => setEnabled(s, enabled, confirmGolden)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {showMcp && (
            <>
              <div className="sk-section-label">
                MCP Servers<span className="sk-count">{mcp.length}</span>
              </div>
              {mcp.length === 0 ? (
                <div className="v0-panel sk-empty">
                  {q ? 'No MCP servers match your search.' : 'No MCP servers registered yet.'}
                </div>
              ) : (
                <div className="sk-grid">
                  {mcp.map((s) => (
                    <SkillCard
                      key={s.id}
                      s={s}
                      open={!!openMap[s.id]}
                      onToggle={() => toggleOpen(s.id)}
                      toggleState={toggleStates[s.id] || 'idle'}
                      onSetEnabled={(enabled, confirmGolden) => setEnabled(s, enabled, confirmGolden)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {visibleCount === 0 && q && (
            <div className="v0-panel sk-empty mt-2">Nothing matches “{query}”.</div>
          )}
        </>
      )}

      {showMcp && <McpMarketplace />}

      {creator && (
        <SkillMcpCreator
          kind={creator}
          onClose={() => setCreator(null)}
          onCreated={() => {
            setLoading(true);
            loadSkills();
          }}
        />
      )}
    </div>
  );
}
