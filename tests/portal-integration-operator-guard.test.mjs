#!/usr/bin/env node
/**
 * PORTAL OVERLAY AUTH GUARD (2026-09-06, BPA-A1-NI-MIRROR-0906).
 *
 * `portal-integration/northside-intelligence/**` is the only place the portal's
 * operator login exists. `requireAxonOperatorId()` lives in the PORTAL's own
 * `src/lib/axon/operator.ts` — this repo has no such helper, and the base routes
 * under `app/api/axon/**` are unauthenticated on purpose because AXON runs them
 * behind its own deployment. The overlay copy is what the portal actually serves,
 * and scripts/sync-portal-ui.mjs writes the overlay LAST so it wins over the base
 * route of the same path.
 *
 * That makes the overlay a silent single point of failure: mirror the BASE route
 * into the portal by mistake and the portal ends up with an unauthenticated
 * endpoint that can reach a paid model lane, with nothing failing loudly. This
 * test is the loud failure.
 *
 * It asserts two things per guarded overlay route:
 *   1. it calls requireAxonOperatorId()
 *   2. it maps 'AXON access denied' to a 401 rather than a generic 500
 *
 * KNOWN GAPS (listed, not hidden): four overlay routes carry no operator check
 * today. They are recorded here so the list can only shrink — adding a new
 * unguarded route fails this test.
 *
 * Offline: reads files only. No network, no env secrets.
 *
 * Run: node --test tests/portal-integration-operator-guard.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OVERLAY_API = 'portal-integration/northside-intelligence/src/app/api';

/** Overlay routes with no operator check as of 2026-09-06. This list may shrink, never grow. */
const KNOWN_UNGUARDED = new Set([
  'axon/outreach/run/route.ts',
  'axon/outreach/settings/route.ts',
  'leads/[id]/send/route.ts',
  'leads/bulk/route.ts',
]);

function routeFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...routeFiles(full, rel));
    else if (entry.name === 'route.ts') out.push({ rel, full });
  }
  return out;
}

const routes = routeFiles(OVERLAY_API);

test('the overlay actually has routes to check', () => {
  assert.ok(routes.length > 10, `expected the portal overlay to carry routes, found ${routes.length}`);
});

test('every guarded overlay route keeps the operator check and its 401', () => {
  const failures = [];
  for (const { rel, full } of routes) {
    if (KNOWN_UNGUARDED.has(rel)) continue;
    const src = readFileSync(full, 'utf8');
    if (!src.includes('requireAxonOperatorId')) failures.push(`${rel}: no requireAxonOperatorId()`);
    else if (!src.includes('AXON access denied')) failures.push(`${rel}: no 401 branch for a denied operator`);
  }
  assert.deepEqual(failures, [], `overlay routes lost their operator check:\n  ${failures.join('\n  ')}`);
});

test('the unguarded list only shrinks — no new unguarded overlay route', () => {
  const unguarded = routes
    .filter(({ full }) => !readFileSync(full, 'utf8').includes('requireAxonOperatorId'))
    .map(({ rel }) => rel);
  const surprises = unguarded.filter((rel) => !KNOWN_UNGUARDED.has(rel));
  assert.deepEqual(surprises, [], `new overlay route with no operator check:\n  ${surprises.join('\n  ')}`);
});

test('the dispatch chat overlay route is guarded — it can reach a paid lane', () => {
  const src = readFileSync(join(OVERLAY_API, 'axon/dispatch/chat/route.ts'), 'utf8');
  assert.match(src, /await requireAxonOperatorId\(\)/);
  assert.match(src, /'AXON access denied'/);
  // The guard must run before the router is reached, not after.
  assert.ok(
    src.indexOf('requireAxonOperatorId()') < src.indexOf('routeChat('),
    'the operator check must run before the router call',
  );
});

test('overlay callers match generateAxonReply(userMessage, channel, history, sessionId, notificationContext)', () => {
  const src = readFileSync(join(OVERLAY_API, 'axon/chat/route.ts'), 'utf8');
  const call = src.match(/generateAxonReply\(([\s\S]*?)\);/)?.[1];
  assert.ok(call, 'expected a generateAxonReply call in the chat overlay route');
  const args = call
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  // operatorId in position 4 used to be written into the session id column, pushing
  // the real session id into notificationContext. It must not come back.
  assert.ok(!args.includes('operatorId'), 'operatorId is not a generateAxonReply argument');
  assert.equal(args[3], 'sessionId', `sessionId must be the 4th argument, got ${args[3]}`);
});
