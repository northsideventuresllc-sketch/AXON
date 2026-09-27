#!/usr/bin/env node
/**
 * FRONTIER-04-ONE-RULEBOOK-EVERYWHERE — keeps this repo's vendored copy of
 * nv-vault's canonical rulebook units in sync, so rulebook-translate.mjs's
 * --check drift mode has something local and fast to check against instead
 * of every repo depending on a live cross-repo fetch at check time.
 *
 * nv-vault (`_meta/rulebook/units/*.md`) is the single source of truth per
 * ticket #548/#577. This repo's `_meta/rulebook/units-vendor/` is a mirror,
 * refreshed by this script — never hand-edited (same "DO NOT hand-edit,
 * edit the source" rule the rendered CLAUDE.md block itself carries).
 *
 * Usage:
 *   GH_PAT=... node scripts/sync-rulebook-units.mjs
 *
 * Fetches the live file list + contents from nv-vault's GitHub Contents API
 * (private repo — needs GH_PAT, the same token already used by this repo's
 * other GitHub-reading scripts), writes them into _meta/rulebook/units-vendor/,
 * removing any vendored file no longer present upstream. Exits 1 on any fetch
 * failure — never silently leaves a stale or partial vendor copy in place.
 */
import { readdirSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'northsideventuresllc-sketch';
const REPO = 'nv-vault';
const UNITS_PATH = '_meta/rulebook/units';
const VENDOR_DIR = path.resolve(process.cwd(), '_meta/rulebook/units-vendor');
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;

async function ghApi(p) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${p}`, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      ...(TOKEN ? { Authorization: `token ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${p}`);
  return res;
}

async function main() {
  if (!TOKEN) {
    console.error('FAIL: set GH_PAT (or GITHUB_TOKEN) — nv-vault is a private repo, an unauthenticated fetch will 404.');
    process.exit(1);
  }
  mkdirSync(VENDOR_DIR, { recursive: true });

  const listRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${UNITS_PATH}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `token ${TOKEN}` },
  });
  if (!listRes.ok) {
    console.error(`FAIL: could not list ${UNITS_PATH} (${listRes.status})`);
    process.exit(1);
  }
  const entries = (await listRes.json()).filter((e) => e.type === 'file' && e.name.endsWith('.md'));

  const seen = new Set();
  for (const entry of entries) {
    const raw = await (await ghApi(`${UNITS_PATH}/${entry.name}`)).text();
    writeFileSync(path.join(VENDOR_DIR, entry.name), raw);
    seen.add(entry.name);
  }

  if (existsSync(VENDOR_DIR)) {
    for (const f of readdirSync(VENDOR_DIR)) {
      if (!seen.has(f)) unlinkSync(path.join(VENDOR_DIR, f));
    }
  }

  console.log(`rulebook-sync: wrote ${seen.size} unit(s) into ${path.relative(process.cwd(), VENDOR_DIR)}.`);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
