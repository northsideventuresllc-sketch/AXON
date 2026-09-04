#!/usr/bin/env node
/**
 * REALTIME-AGENT-SLACK-BUS-0817 — Slack Socket Mode listener.
 *
 * Holds Slack's Socket Mode WebSocket open and forwards every events_api envelope to the
 * already-deployed `slack-agent-router` edge function (Deno.serve, ACTIVE on the NI-Brain
 * Supabase project) — that function already does 100% of the actual dispatch logic (agent
 * tag parsing, nvg_agent_routines lookup, wake_type routing, agent_task_log write). This
 * script's only job is delivery: Socket Mode replaces the HTTP Events API webhook so no
 * public URL / signing-secret exposure is needed, per ARCEUS's 2026-08-25 finding that
 * Socket Mode is already enabled on the Slack app (apps.connections.open verified live).
 *
 * Runs as a long-lived process — intended to be installed on the Mac mini as a launchd
 * daemon (same shape as the mini's existing always-on nvg-mini-runner.py poller). NOT
 * installed by this script or by any agent session: queuing an arbitrary "write a plist and
 * launchctl load it" shell command through nvg_mini_jobs auto-classifies HIGH risk under
 * AX-MINI-JOBS-NO-TIER-GATE-0813 (unmatched shell payloads must not auto-execute) and routes
 * to needs_jb_approval — so the mini-side install is a separate, explicit JB-approved step.
 * Until installed, this can also be run in a foreground terminal for testing:
 *   node scripts/slack-socket-listener.mjs
 *
 * Run: node scripts/slack-socket-listener.mjs
 */
import {
  parseEnvelope,
  isEventsApiEnvelope,
  isValidRouterPayload,
  needsAck,
  buildAck,
  isDisconnectEnvelope,
  nextBackoffMs,
} from '../lib/slack-socket-listener-core.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const ROUTER_URL = `${SUPABASE_URL}/functions/v1/slack-agent-router`;
// Same publishable/anon key every other NVG agent uses to call a Supabase edge function —
// not a secret (see lib/axon-executive-agent.mjs's SLACK_ANON_KEY, same value/comment).
const EDGE_ANON_KEY = 'sb_publishable_-JPXXSn9eyX9BxdvIzTulw_QkHPIERR';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

async function fetchSecret(supabaseKey, key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ni_platform_secrets?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
  );
  if (!res.ok) throw new Error(`fetchSecret(${key}) failed: HTTP ${res.status}`);
  const rows = await res.json();
  return rows?.[0]?.value || null;
}

async function openSocketModeUrl(appToken) {
  const res = await fetch('https://slack.com/api/apps.connections.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${appToken}` },
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`apps.connections.open failed: ${json.error || 'unknown'}`);
  return json.url;
}

async function forwardToRouter(payload) {
  try {
    const res = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${EDGE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[slack-socket-listener] router HTTP ${res.status}`);
  } catch (err) {
    console.error(`[slack-socket-listener] router forward failed: ${err.message}`);
  }
}

/**
 * One Socket Mode connection lifecycle. Resolves when the socket closes (never on success).
 * Resolves to {opened} so the caller can tell "connected, then later dropped" (reset backoff)
 * apart from "never actually connected" (keep backing off — an immediate error/close right
 * after construction, e.g. a bad/expired wss URL, must not reset the retry delay to ~0).
 */
function runOneConnection(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let settled = false;
    let opened = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve({ opened });
      }
    };

    ws.addEventListener('open', () => {
      opened = true;
      console.log('[slack-socket-listener] connected');
    });

    ws.addEventListener('message', (ev) => {
      const msg = parseEnvelope(ev.data);
      if (!msg) return;

      if (needsAck(msg)) ws.send(buildAck(msg));

      if (isEventsApiEnvelope(msg)) {
        if (isValidRouterPayload(msg.payload)) {
          forwardToRouter(msg.payload);
        } else {
          console.error('[slack-socket-listener] dropped events_api envelope with malformed payload shape');
        }
      } else if (isDisconnectEnvelope(msg)) {
        console.log(`[slack-socket-listener] server requested disconnect (${msg.reason || 'unknown'}), reconnecting`);
        ws.close();
      }
    });

    ws.addEventListener('close', done);
    ws.addEventListener('error', (ev) => {
      console.error(`[slack-socket-listener] socket error: ${ev.message || 'unknown'}`);
      done();
    });
  });
}

async function main() {
  if (typeof WebSocket === 'undefined') {
    console.error('global WebSocket is required (Node >=22) — run on a newer Node than this repo\'s package.json floor');
    process.exit(1);
  }
  const supabaseKey = getSupabaseKey();
  if (!supabaseKey) {
    console.error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
    process.exit(1);
  }
  let appToken;
  try {
    appToken = await fetchSecret(supabaseKey, 'SLACK_APP_TOKEN');
  } catch (err) {
    console.error(`SLACK_APP_TOKEN lookup failed: ${err.message}`);
    process.exit(1);
  }
  if (!appToken) {
    console.error('SLACK_APP_TOKEN not found in ni_platform_secrets');
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[slack-socket-listener] ${signal} received, shutting down`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  let attempt = 0;
  while (!shuttingDown) {
    try {
      const url = await openSocketModeUrl(appToken);
      const { opened } = await runOneConnection(url);
      if (opened) attempt = 0; // only a connection that actually opened resets backoff
    } catch (err) {
      console.error(`[slack-socket-listener] connection attempt failed: ${err.message}`);
    }
    if (shuttingDown) break;
    const wait = nextBackoffMs(attempt++);
    console.log(`[slack-socket-listener] reconnecting in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
