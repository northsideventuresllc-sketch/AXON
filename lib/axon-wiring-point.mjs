/**
 * AXON-WIRING-1006 (JB direct order 2026-10-06): AXON Research's own agent note
 * ("00_Command_Center/Agents/AXON Research.md", Done means) requires every build
 * plan to name "the wiring point in AXON (a file or table that exists, found by
 * grep)" — not guessed, not invented. This module is that real grep step.
 *
 * findWiringPoint(buildPlan) tokenizes `build_plan.what_to_build` (the model's own
 * description of what to build), then greps this repo's lib/ and scripts/ trees
 * for files whose source already mentions those same words. The file that matches
 * the most keywords is named as the wiring point; a plan whose keywords match
 * nothing existing gets an honest "net-new file" reason instead of a fabricated
 * path — same honesty rule every other lane in this repo already follows
 * (lib/axon-self-research-build-plans.mjs's "real source or no source").
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

const DEFAULT_SCAN_DIRS = ['lib', 'scripts'];
const SCAN_EXTENSIONS = new Set(['.mjs', '.ts', '.tsx', '.js']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.next']);

// Words too generic to ever single out a file (they'd match almost everything).
const STOPWORDS = new Set(
  'the a an and or but if then else for to of in on at by with from as is are was were be been being this that these those it its not no do did does done has have had will would could should can may might than so per via into out up down over under once more most other some such only own same too very just also build builds building new add adds adding make makes making file table query component prompt change row script agent axon data' // eslint-disable-line max-len
    .split(/\s+/),
);

/** Lowercase, deduped, stopword-filtered words (>=4 chars) from free text. */
export function extractKeywords(text, limit = 8) {
  const words = String(text || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9_-]{3,}/g) || [];
  const unique = [...new Set(words.filter((w) => !STOPWORDS.has(w)))];
  return unique.slice(0, limit);
}

/** Recursively list files under `dir` with one of the scan extensions. Missing dirs are skipped silently. */
function listFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (SCAN_EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}

/**
 * Real grep step: names the one existing file a build plan most likely wires
 * into, or an honest "no match" reason when nothing greps.
 *
 * @param {{ what_to_build?: string, steps?: string[] }} buildPlan
 * @param {{ rootDir?: string, scanDirs?: string[] }} [opts] — injectable for tests,
 *   so a fixture directory can stand in for the real repo tree.
 * @returns {{ file: string|null, matched_keywords: string[], keywords: string[], reason: string|null }}
 */
export function findWiringPoint(buildPlan, opts = {}) {
  const rootDir = opts.rootDir || REPO_ROOT;
  const scanDirs = opts.scanDirs || DEFAULT_SCAN_DIRS;

  const basis = [buildPlan?.what_to_build, ...(buildPlan?.steps || [])].filter(Boolean).join(' ');
  const keywords = extractKeywords(basis);
  if (!keywords.length) {
    return { file: null, matched_keywords: [], keywords: [], reason: 'no usable keywords in build_plan — nothing to grep for' };
  }

  const files = scanDirs.flatMap((d) => listFiles(join(rootDir, d)));
  let best = null;
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8').toLowerCase();
    } catch {
      continue;
    }
    const hits = keywords.filter((k) => content.includes(k));
    if (hits.length && (!best || hits.length > best.hits.length)) {
      best = { file, hits };
      if (best.hits.length === keywords.length) break; // can't do better than all keywords
    }
  }

  if (!best) {
    return {
      file: null,
      matched_keywords: [],
      keywords,
      reason: `no existing lib/ or scripts/ file greps for any of: ${keywords.join(', ')} — likely a net-new file`,
    };
  }

  return {
    file: relative(rootDir, best.file),
    matched_keywords: best.hits,
    keywords,
    reason: null,
  };
}
