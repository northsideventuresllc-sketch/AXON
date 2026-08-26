#!/usr/bin/env node
/**
 * DEPRECATED — AX-WISDOM-LOOP was rebuilt into the AXON Executive Agent
 * (2026-08-26, JB direct order). This file is kept only so any external
 * caller still on the old path (`npm run wisdom`, a stale launchd plist,
 * etc.) keeps working instead of silently breaking — it just forwards to
 * the real entry point.
 *
 * Update any Mac cron/launchd reference (com.nv.axon-wisdom-loop.plist) to
 * call scripts/axon-executive-agent.mjs directly when convenient — this
 * shim is a safety net, not the long-term home.
 */
console.log('[axon-wisdom-loop] deprecated — forwarding to scripts/axon-executive-agent.mjs (AXON Executive Agent)');
await import('./axon-executive-agent.mjs');
