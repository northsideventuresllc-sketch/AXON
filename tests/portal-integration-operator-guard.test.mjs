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
 * It asserts three things per guarded overlay route:
 *   1. it actually AWAITS requireAxonOperatorId() — not merely mentions the name
 *   2. that call comes BEFORE any model call, so nothing is generated before the
 *      caller is known
 *   3. it maps 'AXON access denied' to a 401 rather than a generic 500
 *
 * The overlay also carries its own lib copies (axon-web-chat.ts, operator.ts,
 * app-path.ts, paths.ts, portal-guard.ts). The overlay's axon-web-chat.ts keeps a
 * PER-OPERATOR generateAxonReply(userMessage, channel, history, operatorId, sessionId)
 * — the portal has operators, this repo's own deployment does not — so the overlay
 * route's five-argument call is CORRECT and must not be "fixed" to match the base
 * helper. Dropping operatorId there silently collapses every operator onto 'default'
 * and cross-contaminates profile, memory and workspace lookups. The last test pins
 * the overlay route and the overlay helper to each other so neither can be matched
 * against the base copy by mistake.
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

/**
 * Blank out comments, keeping length and line structure so every index below still
 * points at the same place in the original file. Without this, commenting the guard
 * out passes the check — which is exactly how a guard quietly disappears.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** Position of a real `await requireAxonOperatorId(` invocation, or -1. */
function guardCallIndex(src) {
  return stripComments(src).search(/await\s+requireAxonOperatorId\s*\(/);
}

/** Position of the first model call in the file, or -1 if it makes none. */
function firstModelCallIndex(src) {
  const clean = stripComments(src);
  const hits = [/\brouteChat\s*\(/, /\bgenerateAxonReply\s*\(/, /\baxonGenerate\s*\(/, /\bgenerateViaRouter\s*\(/]
    .map((re) => clean.search(re))
    .filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

test('the overlay actually has routes to check', () => {
  assert.ok(routes.length > 10, `expected the portal overlay to carry routes, found ${routes.length}`);
});

test('every guarded overlay route awaits the operator check, before any model call, and 401s', () => {
  const failures = [];
  for (const { rel, full } of routes) {
    if (KNOWN_UNGUARDED.has(rel)) continue;
    const src = readFileSync(full, 'utf8');
    const guard = guardCallIndex(src);
    if (guard < 0) {
      // A bare import or a mention in a comment is not a check. Only a call counts.
      failures.push(`${rel}: no awaited requireAxonOperatorId(...) call`);
      continue;
    }
    if (!src.includes('AXON access denied')) {
      failures.push(`${rel}: no 401 branch for a denied operator`);
      continue;
    }
    const model = firstModelCallIndex(src);
    if (model >= 0 && model < guard) {
      failures.push(`${rel}: reaches a model before checking the operator`);
    }
  }
  assert.deepEqual(failures, [], `overlay routes lost their operator check:\n  ${failures.join('\n  ')}`);
});

test('the unguarded list only shrinks — no new unguarded overlay route', () => {
  const unguarded = routes
    .filter(({ full }) => guardCallIndex(readFileSync(full, 'utf8')) < 0)
    .map(({ rel }) => rel);
  const surprises = unguarded.filter((rel) => !KNOWN_UNGUARDED.has(rel));
  assert.deepEqual(surprises, [], `new overlay route with no operator check:\n  ${surprises.join('\n  ')}`);
});

test('the dispatch chat overlay route is guarded — it can reach a paid lane', () => {
  const src = readFileSync(join(OVERLAY_API, 'axon/dispatch/chat/route.ts'), 'utf8');
  assert.ok(guardCallIndex(src) >= 0, 'expected an awaited requireAxonOperatorId(...) call');
  assert.match(src, /'AXON access denied'/);
  // The guard must run before the router is reached, not after.
  assert.ok(
    guardCallIndex(src) < firstModelCallIndex(src),
    'the operator check must run before the router call',
  );
});

test('the chat overlay route matches the OVERLAY helper, which is per-operator', () => {
  const helper = readFileSync(
    'portal-integration/northside-intelligence/src/lib/axon/axon-web-chat.ts',
    'utf8',
  );
  const sig = helper.match(/export async function generateAxonReply\(([\s\S]*?)\)\s*\{/)?.[1];
  assert.ok(sig, 'expected generateAxonReply in the overlay helper');
  const params = sig
    .split(',')
    .map((a) => a.trim().split(/[:=?]/)[0].trim())
    .filter(Boolean);
  // The overlay helper is per-operator on purpose. If this ever stops being true,
  // the route below has to change in the SAME commit, not be quietly mismatched.
  assert.deepEqual(params, ['userMessage', 'channel', 'history', 'operatorId', 'sessionId']);

  const route = readFileSync(join(OVERLAY_API, 'axon/chat/route.ts'), 'utf8');
  const call = route.match(/generateAxonReply\(([\s\S]*?)\);/)?.[1];
  assert.ok(call, 'expected a generateAxonReply call in the chat overlay route');
  const args = call
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  // Dropping operatorId here shifts sessionId into the operator slot and collapses
  // every operator onto 'default' — shared profile, memory and workspace. Do not.
  assert.equal(args.length, params.length, 'the route must pass every overlay parameter');
  assert.equal(args[3], 'operatorId', `operatorId must be the 4th argument, got ${args[3]}`);
  assert.equal(args[4], 'sessionId', `sessionId must be the 5th argument, got ${args[4]}`);
});
