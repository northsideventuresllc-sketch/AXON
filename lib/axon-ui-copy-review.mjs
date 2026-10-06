/**
 * AXON UI Copy — reviews on-screen text in this repo's own Next.js app for
 * grammar, word choice and AI slop, and hands fixes to the AXON Executive.
 *
 * JB turned the roster row on 2026-10-06 (IU2-AXON-UICOPY-1006) with no
 * script behind it yet. This is that script's logic, kept separate from the
 * CLI entrypoint (scripts/axon-ui-copy-review.mjs) so it can be unit tested
 * offline — same split as lib/axon-self-research-build-plans.mjs.
 *
 * Extraction is regex-based, not a JSX/TSX AST parse — this is a review aid,
 * not a compiler, and a missed or over-flagged string is a lot cheaper than
 * a new parser dependency. False positives get filtered out by the model
 * review step anyway (it only flags real grammar/word-choice/AI-slop issues).
 *
 * AI-slop markers the review prompt watches for (same patterns the no-ai-slop
 * skill flags): throat-clearing openers, hedging ("it's worth noting that"),
 * "it's not just X, it's Y" constructions, em-dash-heavy rhythm, generic
 * filler adjectives, repetitive scaffolding, unearned enthusiasm.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateViaRouter } from './axon-generate.mjs';
import { writeResearchRunLabLog } from './axon-research-core.mjs';
import { AGENT } from './agent-names.mjs';
import { handoffToAgent } from './axon-agent-comms.mjs';

export const UI_COPY_LANE_ID = 'ui_copy_review';

export const DEFAULT_TARGET_DIRS = ['app', 'components'];
export const DEFAULT_EXTENSIONS = ['.tsx', '.jsx'];
const SKIP_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'build', '.git']);

/** True when a relative file path should be scanned for on-screen text. */
export function isScannableFile(relPath, extensions = DEFAULT_EXTENSIONS) {
  if (!extensions.some((ext) => relPath.endsWith(ext))) return false;
  if (/\.(test|spec)\.[jt]sx?$/.test(relPath)) return false;
  return true;
}

/**
 * Walk `dirs` under `repoRoot` for scannable files. `listDir`/`statIsDir` are
 * injectable so tests never touch the real filesystem.
 */
export function listUiCopyFiles(
  repoRoot,
  {
    dirs = DEFAULT_TARGET_DIRS,
    extensions = DEFAULT_EXTENSIONS,
    listDir = (p) => readdirSync(p, { withFileTypes: true }),
  } = {}
) {
  const out = [];

  function walk(absDir, relDir) {
    let entries;
    try {
      entries = listDir(absDir);
    } catch {
      return; // directory doesn't exist — fine, not every repo has `components`
    }
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const absPath = join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile() && isScannableFile(relPath, extensions)) {
        out.push(relPath);
      }
    }
  }

  for (const dir of dirs) {
    walk(join(repoRoot, dir), dir);
  }
  return out.sort();
}

const CODE_LIKE = /^[A-Za-z0-9_.$-]+$/; // identifiers, class lists, paths — not prose
const COPY_ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

/** Does this extracted string look like real on-screen prose worth reviewing? */
function looksLikeCopy(text) {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (/^https?:\/\//.test(trimmed)) return false;
  if (/\$\{/.test(trimmed)) return false; // template-literal interpolation, not static copy
  if (CODE_LIKE.test(trimmed) && !trimmed.includes(' ')) return false; // single-token identifiers/classNames
  return true;
}

/**
 * Pull candidate on-screen strings out of one file's source: JSX text nodes
 * (`>Some text<`) and common copy-bearing attributes (placeholder=, title=,
 * aria-label=, alt=, label=). Returns [] for files with nothing to review —
 * callers should treat that as a skip, never a model call.
 */
export function extractUserFacingStrings(source) {
  const found = [];
  const seen = new Set();

  const push = (text, kind) => {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!looksLikeCopy(trimmed)) return;
    const key = `${kind}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ text: trimmed, kind });
  };

  // JSX text nodes: >...< with no tag/brace characters inside.
  const jsxTextRe = />([^<>{}\n]+)</g;
  for (const m of source.matchAll(jsxTextRe)) push(m[1], 'jsx-text');

  // Copy-bearing JSX/HTML attributes, double- or single-quoted.
  for (const attr of COPY_ATTRS) {
    const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'g');
    for (const m of source.matchAll(attrRe)) push(m[1], `attr:${attr}`);
  }

  return found;
}

const REVIEW_SYSTEM =
  'You are AXON UI Copy — a careful copy editor for Northside (NVG) product screens. ' +
  'Flag only real grammar errors, awkward word choice, or AI-slop phrasing (throat-clearing ' +
  'openers, hedging like "it is worth noting", "not just X, it is Y" constructions, generic ' +
  'filler adjectives, unearned enthusiasm, repetitive scaffolding). Never flag a string that ' +
  'reads like normal, clear product copy — most strings should get zero issues. Return JSON only.';

export function buildReviewPrompt(filePath, strings) {
  const list = strings.map((s, i) => `${i + 1}. [${s.kind}] "${s.text}"`).join('\n');
  return `File: ${filePath}

On-screen strings found in this file:
${list}

For each string with a real issue, return it in "issues". Leave "issues" empty if every string
reads fine — do not invent problems to have something to say.

Return JSON:
{
  "issues": [
    { "original": "the exact string", "problem": "one sentence — what's wrong", "suggested_fix": "the corrected string" }
  ]
}`;
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

/**
 * Review one file's extracted strings. Never fabricates an issue when the
 * model is unreachable — returns an honest empty/skip result instead, same
 * "no cascade reachable" convention as axon-self-research-build-plans.mjs.
 */
export async function reviewFile({ filePath, strings, supabaseKey, generate = generateViaRouter }) {
  if (!strings.length) {
    return { filePath, issues: [], skipped: true, reason: 'no copy strings found', _provider: 'skipped' };
  }

  try {
    const out = await generate(supabaseKey, {
      system: REVIEW_SYSTEM,
      user: buildReviewPrompt(filePath, strings),
      kind: 'reasoning_planning',
      agentName: 'axon-ui-copy',
      maxTokens: 700,
      jsonMode: true,
    });
    const parsed = extractJson(out.text);
    return {
      filePath,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      skipped: false,
      _provider: out.source,
      _model: out.model,
    };
  } catch (err) {
    return {
      filePath,
      issues: [],
      skipped: true,
      reason: `no AI cascade reachable: ${err.message}`,
      _provider: 'heuristic',
    };
  }
}

/** Build the agent_bus body handed to the AXON Executive. */
export function buildHandoffBody(fileResults, stoppedEarly) {
  const withIssues = fileResults.filter((r) => r.issues.length);
  return {
    kind: 'ui_copy_review',
    date: new Date().toISOString().slice(0, 10),
    stopped_early_at: stoppedEarly,
    files_with_issues: withIssues.length,
    files: withIssues.map((r) => ({
      file: r.filePath,
      issues: r.issues,
    })),
  };
}

/**
 * Run the UI copy review across every scannable file, write a lab-log run
 * row, and hand real findings off to the AXON Executive. `listFiles` and
 * `readFile` are injectable seams so tests never touch the real filesystem
 * or network.
 */
export async function runUiCopyReview({
  sbInsert,
  supabaseKey,
  repoRoot,
  generate = generateViaRouter,
  dryRun = false,
  operatorId = 'default',
  now = new Date(),
  budgetCheck = () => false,
  listFiles = listUiCopyFiles,
  readFile = (p) => readFileSync(p, 'utf8'),
}) {
  const files = listFiles(repoRoot);

  const results = [];
  let stoppedEarly = null;

  for (const relPath of files) {
    if (budgetCheck()) {
      stoppedEarly = relPath;
      break;
    }

    let source;
    try {
      source = readFile(join(repoRoot, relPath));
    } catch (err) {
      results.push({ filePath: relPath, issues: [], skipped: true, reason: `unreadable: ${err.message}`, _provider: 'error' });
      continue;
    }

    const strings = extractUserFacingStrings(source);
    const result = await reviewFile({ filePath: relPath, strings, supabaseKey, generate });
    results.push(result);
  }

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const filesWithIssues = results.filter((r) => r.issues.length).length;
  const filesScanned = results.length;

  const summary =
    `AXON UI Copy review: ${filesScanned}/${files.length} file(s) scanned, ` +
    `${filesWithIssues} with issues (${totalIssues} total)` +
    (stoppedEarly ? `, stopped before "${stoppedEarly}" (time budget)` : '') +
    '.';

  let runId = null;
  if (!dryRun) {
    const runRow = await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: UI_COPY_LANE_ID,
      findingsCount: totalIssues,
      briefingItemsAdded: 0,
      status: 'completed',
      summary,
      meta: {
        files_scanned: filesScanned,
        files_total: files.length,
        files_with_issues: filesWithIssues,
        stopped_early_at: stoppedEarly,
      },
    }).catch((err) => {
      console.log(`⚠️ lab-log write failed: ${err.message}`);
      return null;
    });
    runId = runRow?.id || null;

    if (totalIssues > 0) {
      await handoffToAgent(sbInsert, {
        fromAgent: AGENT.UI_COPY,
        toAgent: AGENT.EXECUTIVE_AGENT,
        subject: `UI-COPY-REVIEW-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
        body: buildHandoffBody(results, stoppedEarly),
        needsAnswer: true,
      });
    }
  }

  return { results, filesScanned, filesWithIssues, totalIssues, stoppedEarly, summary, runId };
}
