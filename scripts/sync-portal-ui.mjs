#!/usr/bin/env node
/**
 * Sync AXON web UI + lib modules into northside-intelligence portal.
 *
 * Trigger: .github/workflows/sync-ni-portal.yml on push to main (needs NI_GITHUB_PAT).
 *   Manual: gh workflow run sync-ni-portal.yml (or push to watched paths on main).
 *   node scripts/sync-portal-ui.mjs /path/to/northside-intelligence
 *
 * Target layout:
 *   src/components/axon-ui/  ← components/axon/
 *   src/lib/axon/            ← selected lib/*.ts
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');
const INTEGRATION_ROOT = join(AXON_ROOT, 'portal-integration/northside-intelligence');

const COMPONENT_FILES = [
  'match-fit-venture-hub.tsx',
  'dispatch-queue-panel.tsx',
  'axon-ambient-bg.tsx',
  'axon-home-settings.tsx',
  'axon-interface.tsx',
  'axon-lab-floor.tsx',
  'axon-notification-settings.tsx',
  'axon-orb-status.tsx',
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
  'icp-fit-badge.tsx',
  'outreach-generate-leads.tsx',
  'outreach-icp-checklist.tsx',
  'outreach-hq-tool.tsx',
  'outreach-training-panel.tsx',
  'outreach-send-modal.tsx',
  'outreach-channel-settings.tsx',
  'panel-focus-view.tsx',
  'previous-chats-flip.tsx',
  'sidebar.tsx',
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
  'axon-chat-sessions.ts',
  'axon-orb-theme.ts',
  'axon-preferences.ts',
  'axon-profile.ts',
  'axon-types.ts',
  'axon-user-tools.ts',
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
];

/** Removed from AXON — delete from portal on sync to avoid .ts/.mjs resolution collisions. */
const STALE_LIB_FILES = [
  'outreach-learn.mjs',
  'outreach-reject.mjs',
  'outreach-run.mjs',
];

const API_FILES = [
  'deals/route.ts',
  'dispatch/fire/route.ts',
  'dispatch/queue/route.ts',
  'dispatch/chat/route.ts',
  'dispatch/[code]/route.ts',
  'follow-up/route.ts',
  'match-fit/session/route.ts',
  'match-fit/data/route.ts',
  'preferences/route.ts',
  'reset/route.ts',
  'outreach/[id]/route.ts',
  'outreach/run/route.ts',
  'outreach/settings/route.ts',
  'quick-links/route.ts',
];

function rewriteImports(content) {
  return content
    .replace(/from '@\/lib\/api-base'/g, "from '@/lib/axon/api-base'")
    .replace(/from '@\/components\/axon\/(?!AxonChangeCodeForm)/g, "from '@/components/axon-ui/")
    .replace(/from '@\/lib\/axon-([^']+)'/g, "from '@/lib/axon/axon-$1'")
    .replace(/from '@\/lib\/use-axon-voice'/g, "from '@/lib/axon/use-axon-voice'")
    .replace(/from '@\/lib\/leads'/g, "from '@/lib/axon/leads'")
    .replace(/from '@\/lib\/types'/g, "from '@/lib/axon/types'")
    .replace(/from '@\/lib\/it-quick-links'/g, "from '@/lib/axon/it-quick-links'")
    .replace(/from '@\/lib\/outreach-edit'/g, "from '@/lib/axon/outreach-edit'")
    .replace(/from '@\/lib\/outreach-reject'/g, "from '@/lib/axon/outreach-reject'")
    .replace(/from '@\/lib\/outreach-learn'/g, "from '@/lib/axon/outreach-learn'")
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
    .replace(/from '@\/lib\/match-fit-hub'/g, "from '@/lib/axon/match-fit-hub'")
    .replace(/from '@\/lib\/paths'/g, "from '@/lib/axon/app-path'");
}

function copyWithRewrite(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const content = readFileSync(src, 'utf8');
  writeFileSync(dest, rewriteImports(content));
}

function syncApiBase(niRoot) {
  const dest = join(niRoot, 'src/lib/axon/api-base.ts');
  const content = `/** Client/API URL — API routes stay at site root; pages use optional AXON vanity base. */
export function apiUrl(path: string, _basePath = ""): string {
  if (path.startsWith("/api/")) return path;
  const base = _basePath || process.env.NEXT_PUBLIC_AXON_BASE_PATH || "";
  return \`\${base}\${path.startsWith("/") ? path : \`/\${path}\`}\`;
}
`;
  writeFileSync(dest, content);
}

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

function applyPortalIntegration(niRoot) {
  if (!existsSync(INTEGRATION_ROOT)) return;

  function walk(dir, base = INTEGRATION_ROOT) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, base);
        continue;
      }
      const rel = relative(base, srcPath);
      if (rel === 'src/components/axon-interface.portal.tsx') {
        copyWithRewrite(srcPath, join(niRoot, 'src/components/axon-ui/axon-interface.tsx'));
        console.log('integration: axon-interface.tsx (portal basePath)');
        continue;
      }
      if (rel === 'tailwind.config.ts') {
        cpSync(srcPath, join(niRoot, 'tailwind.config.ts'));
        console.log('integration: tailwind.config.ts');
        continue;
      }
      const dest = join(niRoot, rel);
      mkdirSync(dirname(dest), { recursive: true });
      if (srcPath.endsWith('.ts') || srcPath.endsWith('.tsx')) {
        copyWithRewrite(srcPath, dest);
      } else {
        cpSync(srcPath, dest);
      }
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

  const componentDest = join(niRoot, 'src/components/axon-ui');
  mkdirSync(componentDest, { recursive: true });

  for (const file of COMPONENT_FILES) {
    const src = join(AXON_ROOT, 'components/axon', file);
    if (!existsSync(src)) {
      console.warn(`skip missing component: ${file}`);
      continue;
    }
    copyWithRewrite(src, join(componentDest, file));
    console.log(`component: ${file}`);
  }

  const libDest = join(niRoot, 'src/lib/axon');
  mkdirSync(libDest, { recursive: true });

  for (const file of LIB_FILES) {
    const src = join(AXON_ROOT, 'lib', file);
    if (!existsSync(src)) {
      console.warn(`skip missing lib: ${file}`);
      continue;
    }
    copyWithRewrite(src, join(libDest, file));
    console.log(`lib: ${file}`);
  }

  for (const file of STALE_LIB_FILES) {
    const stale = join(libDest, file);
    if (existsSync(stale)) {
      unlinkSync(stale);
      console.log(`removed stale lib: ${file}`);
    }
  }

  syncApiBase(niRoot);
  console.log('lib: api-base.ts (portal variant)');

  const appPathSrc = join(INTEGRATION_ROOT, 'src/lib/axon/app-path.ts');
  if (existsSync(appPathSrc)) {
    cpSync(appPathSrc, join(niRoot, 'src/lib/axon/app-path.ts'));
    console.log('lib: app-path.ts (portal vanity routes)');
  }

  for (const file of API_FILES) {
    const src = join(AXON_ROOT, 'app/api/axon', file);
    const dest = join(niRoot, 'src/app/api/axon', file);
    if (!existsSync(src)) continue;
    copyWithRewrite(src, dest);
    console.log(`api: ${file}`);
  }

  appendCss(niRoot);
  console.log('styles: axon.css appended');

  applyPortalIntegration(niRoot);
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
