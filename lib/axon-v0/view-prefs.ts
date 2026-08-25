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
