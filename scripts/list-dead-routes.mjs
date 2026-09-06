#!/usr/bin/env node
/**
 * A8 — dead-route finder.
 *
 * Walks app/api/** for route.ts/route.js files, derives each one's URL path,
 * and greps the rest of the repo for a caller (a fetch() call, a relative
 * reference, a portal-sync list entry, or a middleware.ts allow-list entry).
 * Anything with zero hits anywhere else in the repo is reported "dead".
 *
 * A route can be intentionally EXTERNAL-ONLY (hit by a webhook, a public
 * widget, a cross-repo portal sync, or an open PR) with no in-repo caller.
 * Those are listed explicitly in EXTERNAL_ENTRYPOINTS below with a one-line
 * reason each — this script does not silently skip anything.
 *
 * Usage:
 *   node scripts/list-dead-routes.mjs          # human-readable report
 *   node scripts/list-dead-routes.mjs --json   # machine-readable array
 *
 * Exit code is always 0 — this is a report, not a gate (CI should not fail
 * a build because one operator is mid-refactor). Read the output.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const API_ROOT = path.join(REPO_ROOT, 'app', 'api');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  '.vercel',
]);

// Routes that are, by design, never called from inside this repo — each
// entry names the real caller so this isn't a silent exemption list.
export const EXTERNAL_ENTRYPOINTS = {
  '/api/axon/dispatch/chat':
    'A8 exception: open PR #174 touches this route — leave in place, do not delete.',
  '/api/axon/match-fit/posting-confirmation':
    'Inbound server-to-server webhook from the Match Fit repo, auth by MATCH_FIT_WEBHOOK_SECRET (see middleware.ts).',
  '/api/telegram-webhook':
    'Inbound Telegram bot webhook — called by Telegram, not by this repo.',
  '/api/auth/login': 'Browser form submit from the login page — not a fetch() call site.',
  '/api/auth/logout': 'Browser form submit / nav action — not a fetch() call site.',
};

/** Recursively collect every route.ts / route.js under app/api. */
function findRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.js') {
      out.push(full);
    }
  }
  return out;
}

/** app/api/axon/dispatch/[code]/route.ts -> /api/axon/dispatch/[code] (route groups stripped). */
function routePathFor(routeFile) {
  const rel = path.relative(path.join(REPO_ROOT, 'app'), routeFile);
  const segments = rel
    .split(path.sep)
    .slice(0, -1) // drop route.ts
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))); // drop route groups
  return `/${segments.join('/')}`;
}

/** Build a regex matching this route's path, tolerant of dynamic segments
 *  written as literal `[id]` OR as a template-literal expression. */
function callerPatternFor(routePath) {
  const parts = routePath
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        // literal `[id]` OR any non-separator token (covers `${id}`, `${code}`, etc.)
        return `(?:\\[${seg.slice(1, -1)}\\]|[^/\\s'"\`]+)`;
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
  return new RegExp(parts.join('/'));
}

function listRepoFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listRepoFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function hasCallerElsewhere(routeFile, pattern) {
  const allFiles = listRepoFiles(REPO_ROOT);
  for (const file of allFiles) {
    if (file === routeFile) continue;
    if (file === path.join(__dirname, 'list-dead-routes.mjs')) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable (binary, permissions) — not a text caller
    }
    if (pattern.test(content)) return { file: path.relative(REPO_ROOT, file) };
  }
  return null;
}

export function findDeadRoutes() {
  const routeFiles = findRouteFiles(API_ROOT);
  const dead = [];
  for (const routeFile of routeFiles) {
    const routePath = routePathFor(routeFile);
    if (EXTERNAL_ENTRYPOINTS[routePath]) continue;
    const pattern = callerPatternFor(routePath);
    const caller = hasCallerElsewhere(routeFile, pattern);
    if (!caller) {
      dead.push({
        route: routePath,
        file: path.relative(REPO_ROOT, routeFile),
      });
    }
  }
  return dead;
}

function main() {
  const dead = findDeadRoutes();
  const asJson = process.argv.includes('--json');

  if (asJson) {
    console.log(JSON.stringify(dead, null, 2));
    return;
  }

  if (dead.length === 0) {
    console.log('list-dead-routes: no dead routes found.');
    return;
  }

  console.log(`list-dead-routes: ${dead.length} route(s) with no caller found in the repo:\n`);
  for (const d of dead) {
    console.log(`  ${d.route}  (${d.file})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
