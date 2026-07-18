/**
 * Client-side step learner. Posts a one-line step event to
 * `POST /api/axon/learn` for tools whose actions live entirely in the browser
 * (Reddit queues, Usage Tower caps/tips, Lucielle mode switch).
 *
 * Fire-and-forget: it never throws, never awaits into UX, and silently drops
 * failures. Learning must never block or break an interaction.
 */
import { apiUrl } from './api-base';

export interface ClientStepEvent {
  tool: string;
  step: string;
  before?: unknown;
  after?: unknown;
  venture?: string;
  meta?: Record<string, unknown>;
}

export function learnStepClient(event: ClientStepEvent): void {
  try {
    const body = JSON.stringify(event);
    // Prefer sendBeacon so the event survives navigation and never blocks UX.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(apiUrl('/api/axon/learn'), blob);
      return;
    }
    void fetch(apiUrl('/api/axon/learn'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* learning is best-effort */
  }
}
