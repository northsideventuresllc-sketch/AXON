'use client';

/**
 * Per-viewer UI preferences for the AXON v0 harness, persisted in localStorage.
 * No DB migration is applied yet (db/axon-v0/001 stays staged), so layout/view
 * choices live per-device here until the account tables are approved. Every read
 * is guarded — a private window or blocked storage must not crash the shell.
 */

export type WindowMode = 'default' | 'free' | 'puzzle';

export interface PanelBox {
  /** free-flow: absolute position as a % of the host; puzzle: slot index. */
  x: number;
  y: number;
  w: number;
  h: number;
  slot: number;
  collapsed: boolean;
  hidden: boolean;
  /** puzzle-grid column span (1–3). Optional, added Build-2. */
  col?: number;
  /** puzzle-grid row span (1–2). Optional, added Build-2. */
  rowSpan?: number;
  /** free-flow pixel width (from the corner resize handle). Optional, added Build-2. */
  fw?: number;
  /** free-flow pixel height (from the corner resize handle). Optional, added Build-2. */
  fh?: number;
}

/** One cell in a puzzle template — a target geometry a panel gets arranged into. */
export interface TemplateSlot {
  /** grid column span, 1–3 */
  col: number;
  /** grid row span, 1–2 */
  rowSpan?: number;
}

/** A saved home-space arrangement: presets ship in code, user builds get stored here. */
export interface PuzzleTemplate {
  id: string;
  name: string;
  slots: TemplateSlot[];
  /** apply the CSS-3D curve when this template is active */
  is3D: boolean;
  /** variant that exposes a live 2D↔3D toggle in the toolbar */
  toggle2D3D?: boolean;
  /** true for the code-shipped presets (not user-created) */
  builtin?: boolean;
}

/**
 * A user-described widget drafted in the custom-widget maker. `buildStatus` tracks what
 * happened when it was handed to the venture's Build Manager (item #10,
 * lib/axon-toolkit-build.mjs) — 'draft' means the hand-off never ran (offline, or the
 * request failed before the gate check), 'held' means FIRE/HOLD blocked it, 'dispatched'
 * means the Build Manager has it and is working it, 'completed' means its turn already
 * replied. This is still not runtime provisioning of a live widget — see that module's
 * SCOPE note.
 */
export interface CustomWidgetSpec {
  id: string;
  name: string;
  summary: string;
  icon?: string;
  createdAt: string;
  buildStatus?: 'draft' | 'held' | 'dispatched' | 'completed';
  buildNote?: string;
}

export interface Shortcut {
  id: string;
  label: string; // stored as typed; rendered upper-cased
  href: string; // in-app path (basePath added at render)
  note?: string;
}

export interface ViewPrefs {
  windowMode: WindowMode;
  panels: Record<string, PanelBox>;
  ventureOrder: string[]; // venture ids, first = front of carousel
  ventureHidden: string[]; // venture ids hidden from carousel
  shortcuts: Shortcut[];
  welcomeTemplate: string; // e.g. "Welcome" / "Welcome back, JB"
  bootVoiceLine: string; // spoken on boot
  defaultLanding: string; // where login lands: '/boot' | '/'
  // ---- Build-2 home widget-space additions (all additive) ----
  widgetCurve: number; // CSS-3D curve depth 0–100 (0 = flat plane)
  activeWidgets: string[]; // widget ids currently mounted in the space
  templates: PuzzleTemplate[]; // user-built puzzle templates (presets live in code)
  activeTemplateId: string | null; // currently applied template, if any
  customWidgets: CustomWidgetSpec[]; // specs drafted in the custom-widget maker
}

const KEY = 'axon.v0.viewprefs.v1';

export const DEFAULT_PREFS: ViewPrefs = {
  windowMode: 'default',
  panels: {},
  ventureOrder: [],
  ventureHidden: [],
  shortcuts: [],
  welcomeTemplate: 'Welcome',
  bootVoiceLine: 'Welcome.',
  defaultLanding: '/boot',
  widgetCurve: 35,
  activeWidgets: ['todo', 'notifications', 'usage', 'shortcuts', 'quicklinks'],
  templates: [],
  activeTemplateId: null,
  customWidgets: [],
};

export function loadPrefs(): ViewPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: ViewPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private window / storage blocked — non-fatal */
  }
}

export function patchPrefs(patch: Partial<ViewPrefs>): ViewPrefs {
  const next = { ...loadPrefs(), ...patch };
  savePrefs(next);
  return next;
}

/** Title Case for subtitles: capitalize each significant word. */
export function toTitleCase(s: string): string {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);
  const words = s.trim().toLowerCase().split(/\s+/);
  return words
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Sentence case for body text: capitalize first letter, leave the rest. */
export function toSentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
