#!/usr/bin/env node
/**
 * Sync AXON web UI + lib modules into northside-intelligence portal.
 *
 * Trigger: .github/workflows/sync-ni-portal.yml on push to main (needs NI_GITHUB_PAT).
 *   Manual: gh workflow run sync-ni-portal.yml (or push to watched paths on main).
 *   node scripts/sync-portal-ui.mjs /path/to/northside-intelligence
 *   node scripts/sync-portal-ui.mjs /path/to/northside-intelligence --check   # plan only
 *
 * Target layout:
 *   src/components/axon-ui/  ← components/axon/
 *   src/lib/axon/            ← selected lib/*.ts
 *
 * ── HEALTH-PORTAL-SYNC-DELETES ─────────────────────────────────────────────
 *
 * THIS SCRIPT DELETES BY OVERWRITING, and until now nothing noticed.
 * On 2026-07-28 23:51 UTC sync commit 7d4e12e copied older AXON lib files over the
 * portal ones and removed sbRpc + sbDelete (supabase.mjs), clearChatHistory +
 * deleteChatMessages (axon-profile.ts) and the `since` parameter on
 * fetchCompletedDispatches (agent-dispatch.ts). Every portal caller was left behind,
 * the NI-Portal production build exited 1 on three separate errors, and prod stayed
 * stuck on the previous deployment. The sync had already committed and pushed.
 *
 * Two structural causes, both fixed here:
 *   1. NO PRE-CHECK. Files were written one at a time as the script walked its lists,
 *      so by the time anything could have failed, half the portal was already
 *      overwritten. The script now runs PLAN -> ASSERT -> APPLY: the whole sync is
 *      built in memory, checked, and only then written. A refusal writes nothing.
 *   2. NO CONSENT. Every AXON file won unconditionally, including registries that
 *      only exist portal-side. PORTAL_ONLY_FILES are now never written.
 *
 * The guard lives in scripts/lib/portal-delete-guard.mjs: for each planned write it
 * diffs the exported symbols of the existing portal file against the incoming one and
 * finds portal modules that still import anything about to disappear. If any do, the
 * run fails loudly with file:symbol:importer and commits nothing.
 *
 * STALE_LIB_FILES no longer unlinks blindly either — a still-imported stale file is a
 * refusal, not a delete.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { findBreakingRemovals, formatViolations } from './lib/portal-delete-guard.mjs';
import { execSync } from 'child_process';
import { dirname, join, relative, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');
const INTEGRATION_ROOT = join(AXON_ROOT, 'portal-integration/northside-intelligence');

const COMPONENT_FILES = [
  'match-fit-venture-hub.tsx',
  'match-fit-admin-tool.tsx',
  'dispatch-queue-panel.tsx',
  'cron-jobs-panel.tsx',
  'droid-space.tsx',
  'droid-scene.tsx',
  'droid-detail-modal.tsx',
  'axon-droid-avatar.tsx',
  'follow-up-tool.tsx',
  'hermes-sync-tool.tsx',
  'deal-tracker-tool.tsx',
  'axon-ambient-bg.tsx',
  'axon-home-settings.tsx',
  'axon-interface.tsx',
  'axon-lab-floor.tsx',
  'axon-notification-settings.tsx',
  'axon-orb-status.tsx',
  'axon-quick-links-settings.tsx',
  'axon-reset-settings.tsx',
  'axon-test-notification-buttons.tsx',
  'axon-tool-launch-overlay.tsx',
  'axon-tool-name-settings.tsx',
  'axon-tools-nav.tsx',
  'briefing-panel.tsx',
  'jarvis-orb.tsx',
  'lead-card.tsx',
  'lead-detail.tsx',
  'notifications-panel.tsx',
  'notification-holo-scroll.tsx',
  'notification-detail-modal.tsx',
  'notification-organize-modal.tsx',
  'icp-fit-badge.tsx',
  'outreach-generate-leads.tsx',
  'outreach-icp-checklist.tsx',
  'outreach-hq-tool.tsx',
  'phase1-workflow-panel.tsx',
  'outreach-training-panel.tsx',
  'outreach-send-modal.tsx',
  'outreach-channel-settings.tsx',
  'panel-focus-view.tsx',
  'previous-chats-flip.tsx',
  'sidebar.tsx',
  'axon-collapsible-section.tsx',
  'test-mode-tool.tsx',
  'test-mode-sidebar-panel.tsx',
  'axon-tool-footer.tsx',
  'it-builder-tool.tsx',
  'stats-cards.tsx',
  'status-badge.tsx',
  'todo-panel.tsx',
  'tool-panel.tsx',
  'tool-placeholder.tsx',
  'hermes-sync-tool.tsx',
  'deal-tracker-tool.tsx',
];

const LIB_FILES = [
  'match-fit-hub.ts',
  'agent-dispatch.ts',
  'dispatch-session-store.ts',
  'axon-cron-jobs.ts',
  'axon-cron-service.ts',
  'axon-chat-sessions.ts',
  'axon-orb-theme.ts',
  'axon-preferences.ts',
  'axon-notification-utils.ts',
  'axon-web-chat.ts',
  'use-notification-actions.ts',
  'axon-profile.ts',
  'axon-types.ts',
  'axon-user-tools.ts',
  'it-axon-skeleton.ts',
  'match-fit-session.ts',
  'axon-copy.ts',
  'axon-tool-meta.ts',
  'axon-workspace.ts',
  'it-quick-links.ts',
  'outreach-edit.ts',
  'outreach-reject.ts',
  'outreach-reject-core.mjs',
  'outreach-learn.ts',
  'outreach-learn-core.mjs',
  'outreach-settings.ts',
  'outreach-lifecycle.ts',
  'outreach-lifecycle-core.mjs',
  'outreach-run.ts',
  'outreach-run-core.mjs',
  'icp-config.mjs',
  'constants.mjs',
  'local-model-daily.mjs',
  'prefer-axon-local-models.mjs',
  'github-pat.mjs',
  'axon-quick-links.ts',
  'use-axon-quick-links.ts',
  'types.ts',
  'use-axon-tool-display-names.ts',
  'use-axon-voice.ts',
  'leads.ts',
  'config.mjs',
  'supabase.mjs',
  'resend.mjs',
  'resend.d.ts',
  'outreach-learn-core.d.ts',
  'telegram.mjs',
  'axon-fire-gate.ts',
  'axon-fire-gate-core.mjs',
];

/**
 * Removed from AXON — delete from portal on sync to avoid .ts/.mjs resolution collisions.
 * A stale file that the portal still imports is now a REFUSAL, not a silent unlink.
 */
const STALE_LIB_FILES = [
  'outreach-learn.mjs',
  'outreach-reject.mjs',
  'outreach-run.mjs',
];

/**
 * PORTAL-ONLY registries. These exist in both repos but the PORTAL copy is the real
 * one — it carries entries (monday-review, brain, command-center, droid-space,
 * ni-content) that AXON does not have. Overwriting them does not break the build, it
 * just silently empties JB's tool list, which is exactly the kind of delete that got
 * through unnoticed on 2026-07-28. The sync never writes them.
 *
 * NOTE while touching these: MF-KILL-MONDAY-APPROVALS orders the monday-review screen
 * deleted outright, so nothing here should be taken as a reason to restore that entry.
 */
const PORTAL_ONLY_FILES = new Set([
  'axon-tool-meta.ts',
  'axon-user-tools.ts',
]);

const API_FILES = [
  'deals/route.ts',
  'dispatch/fire/route.ts',
  'dispatch/queue/route.ts',
  'dispatch/chat/route.ts',
  'dispatch/[code]/route.ts',
  'cron/jobs/route.ts',
  'cron/jobs/[id]/toggle/route.ts',
  'follow-up/route.ts',
  'match-fit/session/route.ts',
  'match-fit/data/route.ts',
  'preferences/route.ts',
  'chat/route.ts',
  'reset/route.ts',
  'outreach/[id]/route.ts',
  'outreach/run/route.ts',
  'outreach/settings/route.ts',
  'local-model/route.ts',
  'quick-links/route.ts',
  'it-builder/route.ts',
];

/**
 * AXON v0 harness (Jarvis dash). These live in their own subtrees so the flat lists
 * above stay untouched:
 *   components/axon-v0/*  → src/components/axon-v0/*        (imports unchanged)
 *   lib/axon-v0/*         → src/lib/axon/axon-v0/*          (the axon-* rewrite lands here)
 *   app/api/axon-v0/*     → src/app/api/axon-v0/*
 * The v0 PAGES (app/(axon-v0)/…) are NOT synced yet — the portal gets its page shells
 * via the portal-integration overlay once JB approves the slice.
 */
const V0_COMPONENT_FILES = [
  'voice.ts',
  'orb-home.tsx',
  'venture-carousel.tsx',
  'venture-room.tsx',
  'notifications-board.tsx',
  'quick-links-rail.tsx',
];

const V0_LIB_FILES = [
  'types.ts',
  'store.ts',
  'omni-router.ts',
];

const V0_API_FILES = [
  'ventures/route.ts',
  'agent-chat/route.ts',
  'providers/route.ts',
  'venture-tools/route.ts',
  'brain-graph/route.ts',
  'notifications/route.ts',
];

function rewriteImports(content) {
  return content
    .replace(/from '@\/lib\/api-base'/g, "from '@/lib/axon/api-base'")
    .replace(/from '@\/components\/axon\/(?!AxonChangeCodeForm)/g, "from '@/components/axon-ui/")
    .replace(/from '@\/lib\/axon-([^']+)'/g, "from '@/lib/axon/axon-$1'")
    .replace(/from '@\/lib\/use-axon-voice'/g, "from '@/lib/axon/use-axon-voice'")
    .replace(/from '@\/lib\/use-notification-actions'/g, "from '@/lib/axon/use-notification-actions'")
    .replace(/from '@\/lib\/axon-notification-utils'/g, "from '@/lib/axon/axon-notification-utils'")
    .replace(/from '@\/lib\/leads'/g, "from '@/lib/axon/leads'")
    .replace(/from '@\/lib\/types'/g, "from '@/lib/axon/types'")
    .replace(/from '@\/lib\/it-quick-links'/g, "from '@/lib/axon/it-quick-links'")
    .replace(/from '@\/lib\/outreach-edit'/g, "from '@/lib/axon/outreach-edit'")
    .replace(/from '@\/lib\/outreach-reject'/g, "from '@/lib/axon/outreach-reject'")
    .replace(/from '@\/lib\/outreach-learn'/g, "from '@/lib/axon/outreach-learn'")
    .replace(/from '@\/lib\/local-model-daily\.mjs'/g, "from '@/lib/axon/local-model-daily.mjs'")
    .replace(/from '@\/lib\/outreach-learn-core\.mjs'/g, "from '@/lib/axon/outreach-learn-core.mjs'")
    .replace(/from '@\/lib\/outreach-settings'/g, "from '@/lib/axon/outreach-settings'")
    .replace(/from '@\/lib\/outreach-lifecycle'/g, "from '@/lib/axon/outreach-lifecycle'")
    .replace(/from '@\/lib\/config\.mjs'/g, "from '@/lib/axon/config.mjs'")
    .replace(/from '@\/lib\/constants\.mjs'/g, "from '@/lib/axon/constants.mjs'")
    .replace(/from '@\/lib\/resend\.mjs'/g, "from '@/lib/axon/resend.mjs'")
    .replace(/from '@\/lib\/axon-quick-links'/g, "from '@/lib/axon/axon-quick-links'")
    .replace(/from '@\/lib\/use-axon-quick-links'/g, "from '@/lib/axon/use-axon-quick-links'")
    .replace(/from '@\/lib\/axon-user-tools'/g, "from '@/lib/axon/axon-user-tools'")
    .replace(/from '@\/lib\/use-axon-tool-display-names'/g, "from '@/lib/axon/use-axon-tool-display-names'")
    .replace(/from '@\/lib\/agent-dispatch'/g, "from '@/lib/axon/agent-dispatch'")
    .replace(/from '@\/lib\/dispatch-session-store'/g, "from '@/lib/axon/dispatch-session-store'")
    .replace(/from '@\/lib\/axon-cron-jobs'/g, "from '@/lib/axon/axon-cron-jobs'")
    .replace(/from '@\/lib\/axon-cron-service'/g, "from '@/lib/axon/axon-cron-service'")
    .replace(/from '@\/lib\/it-axon-skeleton'/g, "from '@/lib/axon/it-axon-skeleton'")
    .replace(/from '@\/lib\/match-fit-session'/g, "from '@/lib/axon/match-fit-session'")
    .replace(/from '@\/lib\/axon-tool-meta'/g, "from '@/lib/axon/axon-tool-meta'")
    .replace(/from '@\/lib\/axon-copy'/g, "from '@/lib/axon/axon-copy'")
    .replace(/from '@\/lib\/match-fit-hub'/g, "from '@/lib/axon/match-fit-hub'")
    .replace(/from '@\/lib\/supabase\.mjs'/g, "from '@/lib/axon/supabase.mjs'")
    .replace(/from '@\/lib\/paths'/g, "from '@/lib/axon/app-path'");
}

/** Portal variant of api-base.ts. A constant so it can be PLANNED, not written mid-walk. */
const API_BASE_SOURCE = `/** Client/API URL — API routes stay at site root; pages use optional AXON vanity base. */
export function apiUrl(path: string, _basePath = ""): string {
  if (path.startsWith("/api/")) return path;
  const base = _basePath || process.env.NEXT_PUBLIC_AXON_BASE_PATH || "";
  return \`\${base}\${path.startsWith("/") ? path : \`/\${path}\`}\`;
}
`;

function appendCss(niRoot) {
  const globalsPath = join(AXON_ROOT, 'app/globals.css');
  const axonCssPath = join(niRoot, 'src/styles/axon.css');
  const globals = readFileSync(globalsPath, 'utf8');
  const marker = '/* synced from AXON repo */';
  let axonCss = readFileSync(axonCssPath, 'utf8');
  if (axonCss.includes(marker)) {
    axonCss = axonCss.split(marker)[0].trimEnd();
  }

  const utilityBlock =
    globals.match(/@layer utilities \{([\s\S]*?)\n\}/)?.[1]?.trim() ?? '';
  const keyframes = globals.split('@keyframes scan')[1] ?? '';
  const syncedKeyframes = keyframes ? `@keyframes scan${keyframes}` : '';

  const synced = [axonCss, '', marker, utilityBlock, syncedKeyframes]
    .filter(Boolean)
    .join('\n');

  writeFileSync(axonCssPath, synced);
}

/**
 * Plan the portal-integration overlay. Code files (.ts/.tsx) go through the plan so the
 * delete guard sees them; non-code assets are copied in the apply phase because they
 * cannot remove an export.
 */
function planPortalIntegration(niRoot) {
  const planned = [];
  if (!existsSync(INTEGRATION_ROOT)) return planned;

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(srcPath); continue; }
      const rel = relative(INTEGRATION_ROOT, srcPath);
      if (rel === 'src/components/axon-interface.portal.tsx') {
        planned.push({
          dest: join(niRoot, 'src/components/axon-ui/axon-interface.tsx'),
          content: rewriteImports(readFileSync(srcPath, 'utf8')),
          label: 'integration: axon-interface.tsx (portal basePath)',
          kind: 'integration',
        });
        continue;
      }
      if (rel === 'tailwind.config.ts') continue;                 // config, handled below
      if (!/\.(ts|tsx|mjs|js|jsx)$/.test(srcPath)) continue;       // asset, handled below
      planned.push({
        dest: join(niRoot, rel),
        content: rewriteImports(readFileSync(srcPath, 'utf8')),
        label: `integration: ${rel}`,
        kind: 'integration',
      });
    }
  }

  walk(INTEGRATION_ROOT);
  return planned;
}

/** Copy the overlay pieces that carry no exports (assets + tailwind config). */
function applyIntegrationNonCode(niRoot) {
  if (!existsSync(INTEGRATION_ROOT)) return;

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(srcPath); continue; }
      const rel = relative(INTEGRATION_ROOT, srcPath);
      if (rel === 'src/components/axon-interface.portal.tsx') continue;
      if (rel === 'tailwind.config.ts') {
        cpSync(srcPath, join(niRoot, 'tailwind.config.ts'));
        console.log('integration: tailwind.config.ts');
        continue;
      }
      if (/\.(ts|tsx|mjs|js|jsx)$/.test(srcPath)) continue;        // already planned
      const dest = join(niRoot, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(srcPath, dest);
      console.log(`integration: ${rel}`);
    }
  }

  walk(INTEGRATION_ROOT);
}

function patchPackageJson(niRoot) {
  const pkgPath = join(niRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  let changed = false;
  for (const [name, version] of Object.entries({
    three: '^0.185.1',
    'jarvis-ai-web-animation': '^0.1.2',
  })) {
    if (pkg.dependencies[name] !== version) {
      pkg.dependencies[name] = version;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log('package.json: added three');
  }
}

function main() {
  const niRoot = process.argv[2];
  if (!niRoot || !existsSync(niRoot)) {
    console.error('Usage: node scripts/sync-portal-ui.mjs /path/to/northside-intelligence');
    process.exit(1);
  }

  const CHECK_ONLY = process.argv.includes('--check');

  // ── PHASE 1: PLAN ───────────────────────────────────────────────────────────
  // Build every write in memory. Nothing touches the portal yet, so a refusal in
  // phase 2 leaves the portal exactly as it was. This is the whole fix for
  // HEALTH-PORTAL-SYNC-DELETES: the old script wrote as it walked, so by the time
  // anything could fail it had already overwritten half the tree.
  const plan = [];       // { dest, content|null, label, kind }
  const skipped = [];

  const addWrite = (dest, content, label, kind) => plan.push({ dest, content, label, kind });

  const componentDest = join(niRoot, 'src/components/axon-ui');
  for (const file of COMPONENT_FILES) {
    const src = join(AXON_ROOT, 'components/axon', file);
    if (!existsSync(src)) {
      console.warn(`skip missing component: ${file}`);
      continue;
    }
    addWrite(join(componentDest, file), rewriteImports(readFileSync(src, 'utf8')), `component: ${file}`, 'component');
  }

  const libDest = join(niRoot, 'src/lib/axon');
  for (const file of LIB_FILES) {
    if (PORTAL_ONLY_FILES.has(file)) {
      // The portal copy is the real one. Overwriting it does not break the build, it
      // silently empties JB's tool list — the quietest possible delete.
      skipped.push(`lib: ${file} (PORTAL-ONLY registry, never written by the sync)`);
      continue;
    }
    const src = join(AXON_ROOT, 'lib', file);
    if (!existsSync(src)) {
      console.warn(`skip missing lib: ${file}`);
      continue;
    }
    addWrite(join(libDest, file), rewriteImports(readFileSync(src, 'utf8')), `lib: ${file}`, 'lib');
  }

  // A stale file is only removable if nothing imports it. content:null = planned delete,
  // which the guard treats as "removes every symbol this file exports".
  for (const file of STALE_LIB_FILES) {
    const stale = join(libDest, file);
    if (existsSync(stale)) plan.push({ dest: stale, content: null, label: `stale lib: ${file}`, kind: 'delete' });
  }

  addWrite(join(libDest, 'api-base.ts'), API_BASE_SOURCE, 'lib: api-base.ts (portal variant)', 'lib');

  const appPathSrc = join(INTEGRATION_ROOT, 'src/lib/axon/app-path.ts');
  const appPathDest = join(libDest, 'app-path.ts');
  if (existsSync(appPathSrc) && resolvePath(appPathSrc) !== resolvePath(appPathDest)) {
    addWrite(appPathDest, readFileSync(appPathSrc, 'utf8'), 'lib: app-path.ts (portal vanity routes)', 'lib');
  }

  for (const file of API_FILES) {
    const src = join(AXON_ROOT, 'app/api/axon', file);
    if (!existsSync(src)) continue;
    addWrite(join(niRoot, 'src/app/api/axon', file), rewriteImports(readFileSync(src, 'utf8')), `api: ${file}`, 'api');
  }

  // AXON v0 harness subtrees (see the V0_* lists for the path mapping).
  for (const file of V0_COMPONENT_FILES) {
    const src = join(AXON_ROOT, 'components/axon-v0', file);
    if (!existsSync(src)) {
      console.warn(`skip missing v0 component: ${file}`);
      continue;
    }
    addWrite(join(niRoot, 'src/components/axon-v0', file), rewriteImports(readFileSync(src, 'utf8')), `v0 component: ${file}`, 'component');
  }
  for (const file of V0_LIB_FILES) {
    const src = join(AXON_ROOT, 'lib/axon-v0', file);
    if (!existsSync(src)) {
      console.warn(`skip missing v0 lib: ${file}`);
      continue;
    }
    addWrite(join(niRoot, 'src/lib/axon/axon-v0', file), rewriteImports(readFileSync(src, 'utf8')), `v0 lib: ${file}`, 'lib');
  }
  for (const file of V0_API_FILES) {
    const src = join(AXON_ROOT, 'app/api/axon-v0', file);
    if (!existsSync(src)) continue;
    addWrite(join(niRoot, 'src/app/api/axon-v0', file), rewriteImports(readFileSync(src, 'utf8')), `v0 api: ${file}`, 'api');
  }

  for (const entry of planPortalIntegration(niRoot)) plan.push(entry);

  // ── PHASE 2: ASSERT ─────────────────────────────────────────────────────────
  // Refuse to remove an export the portal still imports. Fails the workflow; commits
  // nothing. This is the check whose absence let 7d4e12e reach production.
  const violations = findBreakingRemovals(
    niRoot,
    plan.map((p) => ({ dest: p.dest, incoming: p.content, label: p.label })),
  );

  if (violations.length > 0) {
    console.error(formatViolations(violations));
    console.error(`${plan.length} planned write(s) DISCARDED. The portal was not modified.`);
    process.exit(1);
  }

  console.log(`Plan checked: ${plan.length} write(s), 0 breaking removals.`);
  for (const s2 of skipped) console.log(`  ${s2}`);

  if (CHECK_ONLY) {
    console.log('\n--check: plan verified, nothing written.');
    return;
  }

  // ── PHASE 3: APPLY ──────────────────────────────────────────────────────────
  for (const item of plan) {
    if (item.content === null) {
      unlinkSync(item.dest);
      console.log(`removed ${item.label} (verified unimported)`);
      continue;
    }
    mkdirSync(dirname(item.dest), { recursive: true });
    writeFileSync(item.dest, item.content);
    console.log(item.label);
  }

  appendCss(niRoot);
  console.log('styles: axon.css appended');

  applyIntegrationNonCode(niRoot);
  patchPackageJson(niRoot);
  writeSyncManifest(niRoot);

  console.log(`\nSynced AXON UI → ${relative(process.cwd(), niRoot)}`);
  console.log('Next: cd into NI repo, run npm install && npm run build, then merge.');
}

function writeSyncManifest(niRoot) {
  let axonSha = 'unknown';
  try {
    axonSha = execSync('git rev-parse HEAD', { cwd: AXON_ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const manifest = {
    syncedAt: new Date().toISOString(),
    axonCommit: axonSha,
    source: 'northsideventuresllc-sketch/AXON',
  };
  const dest = join(niRoot, 'src/lib/axon/.axon-sync-manifest.json');
  writeFileSync(dest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('manifest: .axon-sync-manifest.json');
}

main();
