/**
 * NVG / AXON copy capitalization — titles & buttons use Title Case or ALL CAPS;
 * descriptions use sentence case. Preference learned from operator feedback.
 */
export type AxonCopyStyle = 'title' | 'caps';

const PREF_KEY = 'axon.copyStylePreference';
const FEEDBACK_KEY = 'axon.copyAestheticFeedback';

function readPreference(): AxonCopyStyle {
  if (typeof window === 'undefined') return 'title';
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'caps' ? 'caps' : 'title';
  } catch {
    return 'title';
  }
}

/** Record operator dislike — shifts default toward the alternate style. */
export function recordCopyAestheticFeedback(liked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const prev = raw ? (JSON.parse(raw) as { likes: number; dislikes: number }) : { likes: 0, dislikes: 0 };
    if (liked) prev.likes += 1;
    else prev.dislikes += 1;
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(prev));
    const next: AxonCopyStyle = prev.dislikes > prev.likes ? 'caps' : 'title';
    localStorage.setItem(PREF_KEY, next);
    window.dispatchEvent(new CustomEvent('axon:copy-preference-updated'));
  } catch {
    /* ignore */
  }
}

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/** Big headings — Title Case or ALL CAPS per learned preference. */
export function formatAxonTitle(text: string, force?: AxonCopyStyle): string {
  const style = force ?? readPreference();
  return style === 'caps' ? text.toUpperCase() : toTitleCase(text);
}

/** Buttons & nav labels — same rules as titles. */
export function formatAxonButton(text: string, force?: AxonCopyStyle): string {
  return formatAxonTitle(text, force);
}

/** Body / helper copy — sentence case only. */
export function formatAxonDescription(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
