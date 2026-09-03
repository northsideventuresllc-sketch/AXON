/**
 * Pure helpers for the Slack Socket Mode listener (REALTIME-AGENT-SLACK-BUS-0817).
 * No I/O here so this file needs no Supabase/Slack credentials to test — see
 * tests/slack-socket-listener-core.test.mjs. The stateful WebSocket/HTTP work lives in
 * scripts/slack-socket-listener.mjs, which imports these.
 */

/** Parse one Socket Mode frame. Returns null (never throws) on malformed JSON. */
export function parseEnvelope(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** True for the one envelope type this listener forwards on — Slack Events API messages. */
export function isEventsApiEnvelope(msg) {
  return !!msg && msg.type === 'events_api' && !!msg.payload;
}

/** Slack requires every enveloped frame acked within 3s, regardless of type. */
export function needsAck(msg) {
  return !!msg && typeof msg.envelope_id === 'string' && msg.envelope_id.length > 0;
}

export function buildAck(msg) {
  return JSON.stringify({ envelope_id: msg.envelope_id });
}

/** Slack sends {type:'disconnect'} shortly before it drops the socket on its end. */
export function isDisconnectEnvelope(msg) {
  return !!msg && msg.type === 'disconnect';
}

/** Exponential backoff for reconnects, capped at 30s, jittered to avoid thundering herd. */
export function nextBackoffMs(attempt) {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}
