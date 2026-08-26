'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { loadPrefs, patchPrefs, type WindowMode } from '@/lib/axon-v0/view-prefs';
import '@/components/axon-v0/settings-sections.css';

interface Provider {
  id: string;
  label: string;
  kind: string;
  base_url: string | null;
  model: string;
  has_key: boolean;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Venture {
  id: string;
  name: string;
  agents: Agent[];
}

const TIER_CHAIN = [
  'AXON local (Mac mini)',
  'RunPod AXON v1',
  'Gemini primary',
  'Gemini backup',
  'Claude (last resort)',
];

// localStorage keys owned by this Settings page (view-prefs.ts untouched).
const CUSTOM_KEY = 'axon.v0.custom_instructions';
const NOTIF_KEY = 'axon.v0.notif_settings';

interface NotifSettings {
  dispatchDone: boolean;
  approvalNeeded: boolean;
  errors: boolean;
  dailyDigest: boolean;
  sound: boolean;
}

const NOTIF_DEFAULTS: NotifSettings = {
  dispatchDone: true,
  approvalNeeded: true,
  errors: true,
  dailyDigest: false,
  sound: false,
};

const NOTIF_ROWS: { key: keyof NotifSettings; label: string; desc: string }[] = [
  { key: 'dispatchDone', label: 'Dispatch finished', desc: 'Ping me when an agent completes a run.' },
  { key: 'approvalNeeded', label: 'Approval needed', desc: 'A send or fire is waiting on my go-ahead.' },
  { key: 'errors', label: 'Errors & failures', desc: 'Something broke or a tier fell through.' },
  { key: 'dailyDigest', label: 'Daily digest', desc: 'One roll-up of the day, once a day.' },
  { key: 'sound', label: 'Sound on notify', desc: 'Play the boot chime with new alerts.' },
];

function loadCustom(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(CUSTOM_KEY) || '';
  } catch {
    return '';
  }
}

function saveCustom(v: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_KEY, v);
  } catch {
    /* private window / storage blocked — non-fatal */
  }
}

function loadNotif(): NotifSettings {
  if (typeof window === 'undefined') return { ...NOTIF_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(NOTIF_KEY);
    if (!raw) return { ...NOTIF_DEFAULTS };
    return { ...NOTIF_DEFAULTS, ...(JSON.parse(raw) as Partial<NotifSettings>) };
  } catch {
    return { ...NOTIF_DEFAULTS };
  }
}

function saveNotif(v: NotifSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIF_KEY, JSON.stringify(v));
  } catch {
    /* non-fatal */
  }
}

const SECTIONS = [
  { id: 'glossary', label: 'What to set up' },
  { id: 'login', label: 'Login' },
  { id: 'view', label: 'Default view' },
  { id: 'models', label: 'Models & routing' },
  { id: 'instructions', label: 'Specific instructions' },
  { id: 'notifications', label: 'Notifications' },
];

export default function SettingsPage() {
  // --- Omni-Router state (preserved from the original models page) ---
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [form, setForm] = useState({ label: '', kind: 'openai-compatible', base_url: '', model: '', api_key: '' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // --- Settings state ---
  const [welcomeTemplate, setWelcomeTemplate] = useState('Welcome');
  const [bootVoiceLine, setBootVoiceLine] = useState('Welcome.');
  const [windowMode, setWindowMode] = useState<WindowMode>('default');
  const [defaultLanding, setDefaultLanding] = useState('/boot');
  const [customInstructions, setCustomInstructions] = useState('');
  const [notif, setNotif] = useState<NotifSettings>(NOTIF_DEFAULTS);
  const [flash, setFlash] = useState<Record<string, string>>({});

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, true])),
  );
  const [active, setActive] = useState<string>('glossary');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/providers'))
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => setVentures(d.ventures || []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  // Hydrate settings from prefs / localStorage on mount (client only).
  useEffect(() => {
    const p = loadPrefs();
    setWelcomeTemplate(p.welcomeTemplate);
    setBootVoiceLine(p.bootVoiceLine);
    setWindowMode(p.windowMode);
    setDefaultLanding(p.defaultLanding);
    setCustomInstructions(loadCustom());
    setNotif(loadNotif());
  }, []);

  function flashSaved(id: string, msg = 'Saved.') {
    setFlash((f) => ({ ...f, [id]: msg }));
    window.setTimeout(() => setFlash((f) => ({ ...f, [id]: '' })), 1800);
  }

  // --- Omni-Router handlers (preserved) ---
  async function addProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.model.trim()) return;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/providers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not save the model.');
      setForm({ label: '', kind: 'openai-compatible', base_url: '', model: '', api_key: '' });
      setStatus('Model saved. The key never leaves the server.');
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save the model.');
    } finally {
      setSaving(false);
    }
  }

  async function assign(agentId: string, value: string) {
    const body =
      value === 'auto'
        ? { assign: { agentId, mode: 'auto', providerId: null } }
        : { assign: { agentId, mode: 'fixed', providerId: value } };
    await fetch(apiUrl('/api/axon-v0/providers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    setStatus('Routing updated.');
  }

  // --- Settings persistence (patchPrefs / guarded localStorage) ---
  function saveLogin() {
    patchPrefs({ welcomeTemplate, bootVoiceLine });
    flashSaved('login');
  }

  function pickWindowMode(mode: WindowMode) {
    setWindowMode(mode);
    patchPrefs({ windowMode: mode });
    flashSaved('view');
  }

  function pickLanding(landing: string) {
    setDefaultLanding(landing);
    patchPrefs({ defaultLanding: landing });
    flashSaved('view');
  }

  function saveInstructions() {
    saveCustom(customInstructions);
    flashSaved('instructions');
  }

  function toggleNotif(key: keyof NotifSettings) {
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    saveNotif(next);
    flashSaved('notifications', 'Preferences saved.');
  }

  function scrollTo(id: string) {
    setActive(id);
    setOpen((o) => ({ ...o, [id]: true }));
    // allow the section to expand before scrolling
    window.setTimeout(() => {
      sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 20);
  }

  function toggleSection(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  const setRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  return (
    <div className="v0-rise mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">SETTINGS</h1>
      <p className="mt-2 text-sm text-slate-400">
        The control room for how AXON greets you, lays itself out, routes its models, and pings you.
      </p>

      <div className="st-hub mt-6">
        {/* Left mini-index */}
        <nav className="st-index" aria-label="Settings sections">
          <p className="st-index-title">Sections</p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className={`st-index-link ${active === s.id ? 'st-index-link-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Sections */}
        <div className="st-sections">
          {/* GLOSSARY */}
          <section ref={setRef('glossary')} id="glossary" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('glossary')}>
              <span>
                <span className="st-section-title">What to set up here</span>
                <span className="st-section-sub">A plain-English map of every section below.</span>
              </span>
              <span className={`st-caret ${open.glossary ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.glossary && (
              <div className="st-section-body">
                <div className="st-glossary-item">
                  <span className="st-glossary-name">Login</span>
                  <span className="st-glossary-desc">
                    The welcome message and the line AXON speaks when it boots up.
                  </span>
                </div>
                <div className="st-glossary-item">
                  <span className="st-glossary-name">Default view</span>
                  <span className="st-glossary-desc">
                    How the command deck arranges its windows, and which screen you land on after login.
                  </span>
                </div>
                <div className="st-glossary-item">
                  <span className="st-glossary-name">Models &amp; routing</span>
                  <span className="st-glossary-desc">
                    Plug in your own models and choose which agent runs on which — the old Omni-Router.
                  </span>
                </div>
                <div className="st-glossary-item">
                  <span className="st-glossary-name">Specific instructions</span>
                  <span className="st-glossary-desc">
                    Standing custom instructions every agent reads before it acts, like Claude&apos;s.
                  </span>
                </div>
                <div className="st-glossary-item">
                  <span className="st-glossary-name">Notifications</span>
                  <span className="st-glossary-desc">When AXON should ping you, and when it should stay quiet.</span>
                </div>
              </div>
            )}
          </section>

          {/* LOGIN */}
          <section ref={setRef('login')} id="login" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('login')}>
              <span>
                <span className="st-section-title">Login settings</span>
                <span className="st-section-sub">How AXON greets you when you arrive.</span>
              </span>
              <span className={`st-caret ${open.login ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.login && (
              <div className="st-section-body">
                <div className="st-field">
                  <label className="st-label" htmlFor="st-welcome">
                    Welcome template
                  </label>
                  <input
                    id="st-welcome"
                    className="st-input"
                    value={welcomeTemplate}
                    onChange={(e) => setWelcomeTemplate(e.target.value)}
                    onBlur={saveLogin}
                    placeholder="Welcome back, JB"
                  />
                  <p className="st-hint">Shown on the boot screen. Blur or save to persist.</p>
                </div>
                <div className="st-field">
                  <label className="st-label" htmlFor="st-voice">
                    Boot voice line
                  </label>
                  <input
                    id="st-voice"
                    className="st-input"
                    value={bootVoiceLine}
                    onChange={(e) => setBootVoiceLine(e.target.value)}
                    onBlur={saveLogin}
                    placeholder="Welcome."
                  />
                  <p className="st-hint">Spoken aloud on boot.</p>
                </div>
                <button
                  type="button"
                  onClick={saveLogin}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
                >
                  Save login settings
                </button>
                {flash.login && <p className="st-saved">{flash.login}</p>}

                <div className="mt-4 space-y-2">
                  <p className="st-note">Email + code sign-in is live now — enter your email, get a one-time code.</p>
                  <p className="st-note">
                    Google and GitHub sign-in
                    <span className="st-badge">Build 2</span>
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* DEFAULT VIEW */}
          <section ref={setRef('view')} id="view" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('view')}>
              <span>
                <span className="st-section-title">Default view settings</span>
                <span className="st-section-sub">Your default layout and landing screen.</span>
              </span>
              <span className={`st-caret ${open.view ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.view && (
              <div className="st-section-body">
                <div className="st-field">
                  <span className="st-label">Window layout mode</span>
                  <div className="st-seg">
                    {(['default', 'puzzle', 'free'] as WindowMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => pickWindowMode(m)}
                        className={`st-seg-btn ${windowMode === m ? 'st-seg-btn-active' : ''}`}
                      >
                        {m === 'default' ? 'Default' : m === 'puzzle' ? 'Puzzle' : 'Free-flow'}
                      </button>
                    ))}
                  </div>
                  <p className="st-hint">
                    Default stacks panels; Puzzle snaps them to a grid; Free-flow lets you drag them anywhere.
                  </p>
                </div>
                <div className="st-field">
                  <span className="st-label">Default landing after login</span>
                  <div className="st-seg">
                    {[
                      { v: '/boot', label: 'Boot screen' },
                      { v: '/', label: 'Command deck' },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => pickLanding(o.v)}
                        className={`st-seg-btn ${defaultLanding === o.v ? 'st-seg-btn-active' : ''}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="st-hint">Where AXON drops you the moment you sign in.</p>
                </div>
                {flash.view && <p className="st-saved">{flash.view}</p>}
              </div>
            )}
          </section>

          {/* MODELS & ROUTING (absorbed Omni-Router) */}
          <section ref={setRef('models')} id="models" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('models')}>
              <span>
                <span className="st-section-title">Models &amp; routing</span>
                <span className="st-section-sub">
                  Plug in any model. Every agent runs on AXON auto unless you pin it.
                </span>
              </span>
              <span className={`st-caret ${open.models ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.models && (
              <div className="st-section-body">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Tier chain + BYO models */}
                  <div className="space-y-6">
                    <div className="rounded-lg border border-cyan-400/10 bg-black/20 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
                        AXON auto — the tier chain
                      </p>
                      <ol className="mt-3 space-y-1.5 font-mono text-xs text-slate-300">
                        {TIER_CHAIN.map((t, i) => (
                          <li key={t}>
                            <span className="text-cyan-300/70">{i + 1}.</span> {t}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 text-[11px] text-slate-500">
                        Tries each tier in order and falls through automatically when one is down.
                      </p>
                    </div>

                    <div className="rounded-lg border border-cyan-400/10 bg-black/20 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Your models</p>
                      <div className="mt-2 space-y-2">
                        {providers.length === 0 && <p className="text-xs text-slate-500">None added yet.</p>}
                        {providers.map((p) => (
                          <div key={p.id} className="rounded-lg border border-cyan-400/10 bg-black/30 px-3 py-2">
                            <p className="text-sm text-slate-200">{p.label}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                              {p.kind} · {p.model} {p.has_key ? '· 🔑 key stored' : '· no key'}
                            </p>
                          </div>
                        ))}
                      </div>

                      <form onSubmit={addProvider} className="mt-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Add a model</p>
                        <input
                          value={form.label}
                          onChange={(e) => setForm({ ...form, label: e.target.value })}
                          placeholder="Name (e.g. My GPT key)"
                          className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={form.kind}
                            onChange={(e) => setForm({ ...form, kind: e.target.value })}
                            className="rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                          >
                            <option value="openai-compatible">OpenAI-compatible</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Gemini</option>
                            <option value="ollama">Ollama (local)</option>
                          </select>
                          <input
                            value={form.model}
                            onChange={(e) => setForm({ ...form, model: e.target.value })}
                            placeholder="Model id"
                            className="rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                          />
                        </div>
                        <input
                          value={form.base_url}
                          onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                          placeholder="Base URL (optional)"
                          className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                        />
                        <input
                          type="password"
                          value={form.api_key}
                          onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                          placeholder="API key (stored server-side only)"
                          className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                        />
                        <button
                          type="submit"
                          disabled={saving}
                          className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save model'}
                        </button>
                      </form>
                      {status && <p className="mt-2 text-[11px] text-cyan-200/80">{status}</p>}
                    </div>
                  </div>

                  {/* Per-agent routing */}
                  <div className="rounded-lg border border-cyan-400/10 bg-black/20 p-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Who runs on what</p>
                    <div className="mt-3 space-y-4">
                      {ventures.map((v) => (
                        <div key={v.id}>
                          <p className="text-xs font-medium text-slate-300">{v.name}</p>
                          <div className="mt-1.5 space-y-1.5">
                            {v.agents.map((a) => (
                              <div key={a.id} className="flex items-center justify-between gap-2">
                                <span className="truncate text-[11px] text-slate-400">{a.name}</span>
                                <select
                                  defaultValue="auto"
                                  onChange={(e) => assign(a.id, e.target.value)}
                                  className="rounded-md border border-cyan-400/20 bg-black/50 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-400/60"
                                >
                                  <option value="auto">AXON auto</option>
                                  {providers.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {ventures.length === 0 && <p className="text-xs text-slate-500">No ventures yet.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* SPECIFIC INSTRUCTIONS */}
          <section ref={setRef('instructions')} id="instructions" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('instructions')}>
              <span>
                <span className="st-section-title">Specific instructions</span>
                <span className="st-section-sub">Standing custom instructions every agent reads first.</span>
              </span>
              <span className={`st-caret ${open.instructions ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.instructions && (
              <div className="st-section-body">
                <div className="st-field">
                  <label className="st-label" htmlFor="st-instructions">
                    Custom instructions
                  </label>
                  <textarea
                    id="st-instructions"
                    className="st-textarea v0-scroll"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    onBlur={saveInstructions}
                    placeholder="e.g. Always use Northside casing. Never auto-send outreach. Keep replies to one outcome."
                  />
                  <p className="st-hint">
                    Applied as standing context before any agent acts. Saved on blur or with the button.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveInstructions}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
                >
                  Save instructions
                </button>
                {flash.instructions && <p className="st-saved">{flash.instructions}</p>}
              </div>
            )}
          </section>

          {/* NOTIFICATIONS */}
          <section ref={setRef('notifications')} id="notifications" className="st-section v0-panel p-4">
            <button type="button" className="st-section-head" onClick={() => toggleSection('notifications')}>
              <span>
                <span className="st-section-title">Notification settings</span>
                <span className="st-section-sub">When AXON pings you, and when it stays quiet.</span>
              </span>
              <span className={`st-caret ${open.notifications ? 'st-caret-open' : ''}`}>▶</span>
            </button>
            {open.notifications && (
              <div className="st-section-body">
                {NOTIF_ROWS.map((row) => (
                  <div key={row.key} className="st-toggle-row">
                    <div>
                      <p className="st-toggle-label">{row.label}</p>
                      <p className="st-toggle-desc">{row.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notif[row.key]}
                      aria-label={row.label}
                      onClick={() => toggleNotif(row.key)}
                      className={`st-switch ${notif[row.key] ? 'st-switch-on' : ''}`}
                    >
                      <span className="st-switch-knob" />
                    </button>
                  </div>
                ))}
                {flash.notifications && <p className="st-saved">{flash.notifications}</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
