/**
 * B6 — trivial helper for EXEC's morning message: the absolute URL of the Dash
 * To-Do page. Mirrors DEFAULT_WEBHOOK_URL's host fallback in lib/config.mjs
 * (same deployed AXON app), overridable via AXON_APP_URL for other environments.
 */
const DEFAULT_APP_URL = 'https://axon-northsideventuresllc-sketchs-projects.vercel.app';

/** Absolute URL of the Dash → To-Do page. */
export function axonTodoLink(): string {
  const base = (process.env.AXON_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
  return `${base}${basePath}/todo`;
}
