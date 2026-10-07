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

/** Stop calling the model after this many chain failures in a row (each one costs router writes + a Slack post). */
export const MAX_CONSECUTIVE_CHAIN_FAILURES = 3;
/** The sorted file list is split into this many start points; the ISO week picks one. */
export const ROTATION_WINDOWS = 4;
/** Caps on what a model reply may hand to the Executive. */
export const MAX_ISSUES_PER_FILE = 20;
export const MAX_ISSUE_FIELD_CHARS = 300;

const ROUTINE_ID = 'axon-ui-copy-review';
const DEFAULT_TIME_BUDGET_MS = 8 * 60_000;

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

/** ISO 8601 week number (1-53) for a date, computed in UTC. */
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Where this week's run starts in the sorted file list. Deterministic from the
 * date alone (no stored progress), so when the time budget cuts a run short the
 * tail files lead a later week instead of starving behind the same head files.
 */
export function rotationOffset(total, now = new Date(), windows = ROTATION_WINDOWS) {
  if (total <= 1) return 0;
  const w = Math.max(1, Math.min(windows, total));
  const stride = Math.ceil(total / w);
  return (((isoWeekNumber(now) % w) * stride) % total);
}

/** Same files, rotated to this week's start point. */
export function rotateFiles(files, now = new Date(), windows = ROTATION_WINDOWS) {
  const offset = rotationOffset(files.length, now, windows);
  return { files: [...files.slice(offset), ...files.slice(0, offset)], offset };
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

function brief(message, max = 200) {
  const text = String(message ?? 'unknown error').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const normalizeText = (t) => String(t).trim().replace(/\s+/g, ' ');

/**
 * Model output is untrusted. Keep an issue only when it has the three string
 * fields, every field is within the length cap, and `original` is one of the
 * strings this file actually showed the model (so a made-up quote never reaches
 * the Executive). Extra fields are stripped; duplicates and no-op fixes dropped.
 */
export function sanitizeIssues(rawIssues, strings) {
  if (!Array.isArray(rawIssues)) return { issues: [], dropped: 0 };
  const shown = new Set(strings.map((s) => s.text));
  const seen = new Set();
  const issues = [];
  const considered = rawIssues.slice(0, 100);
  let dropped = rawIssues.length - considered.length;

  for (const raw of considered) {
    const ok =
      raw && typeof raw === 'object' && !Array.isArray(raw) &&
      typeof raw.original === 'string' && typeof raw.problem === 'string' && typeof raw.suggested_fix === 'string';
    if (!ok || issues.length >= MAX_ISSUES_PER_FILE) {
      dropped += 1;
      continue;
    }
    const original = normalizeText(raw.original);
    const problem = normalizeText(raw.problem);
    const suggestedFix = normalizeText(raw.suggested_fix);
    const valid =
      original && problem && suggestedFix &&
      [original, problem, suggestedFix].every((f) => f.length <= MAX_ISSUE_FIELD_CHARS) &&
      shown.has(original) && suggestedFix !== original && !seen.has(original);
    if (!valid) {
      dropped += 1;
      continue;
    }
    seen.add(original);
    issues.push({ original, problem, suggested_fix: suggestedFix });
  }
  return { issues, dropped };
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
export async function reviewFile({ filePath, strings, supabaseKey, generate = generateViaRouter, dryRun = false }) {
  const stringCount = strings.length;
  if (!stringCount) {
    return { filePath, issues: [], skipped: true, noCopy: true, stringCount, reason: 'no copy strings found', _provider: 'skipped' };
  }
  // A dry run never reaches a model: no router call, no quota, no router-side writes.
  if (dryRun) {
    return { filePath, issues: [], skipped: true, dryRun: true, stringCount, reason: 'dry run: not sent to a model', _provider: 'dry-run' };
  }

  let out;
  try {
    out = await generate(supabaseKey, {
      system: REVIEW_SYSTEM,
      user: buildReviewPrompt(filePath, strings),
      kind: 'reasoning_planning',
      agentName: 'axon-ui-copy',
      maxTokens: 700,
      jsonMode: true,
    });
  } catch (err) {
    return {
      filePath,
      issues: [],
      skipped: true,
      failure: 'chain',
      stringCount,
      reason: `no AI cascade reachable: ${brief(err?.message)}`,
      _provider: 'heuristic',
    };
  }

  let parsed;
  try {
    parsed = extractJson(out?.text);
  } catch (err) {
    // The chain answered, so this is not a reachability failure.
    return {
      filePath,
      issues: [],
      skipped: true,
      failure: 'parse',
      stringCount,
      reason: `model reply could not be read: ${brief(err?.message)}`,
      _provider: out?.source,
      _model: out?.model,
    };
  }

  const { issues, dropped } = sanitizeIssues(parsed?.issues, strings);
  return { filePath, issues, droppedIssues: dropped, skipped: false, stringCount, _provider: out.source, _model: out.model };
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
 *
 * dryRun is extraction-only: files are read and counted, but `generate` is
 * never called, nothing is written, and no network is touched.
 *
 * The run only reports "completed" when at least one file was actually
 * reviewed. After `maxConsecutiveFailures` model-chain failures in a row it
 * stops (every failed router call posts to Slack and writes dead-letter and
 * cost rows) and records one skipped row.
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
  rotationWindows = ROTATION_WINDOWS,
  maxConsecutiveFailures = MAX_CONSECUTIVE_CHAIN_FAILURES,
}) {
  const { files, offset: startOffset } = rotateFiles(listFiles(repoRoot), now, rotationWindows);

  const results = [];
  let stoppedEarly = null;
  let breakerTripped = false;
  let notReached = 0;
  let chainFailuresInARow = 0;

  for (let i = 0; i < files.length; i++) {
    const relPath = files[i];
    if (budgetCheck()) {
      stoppedEarly = relPath;
      break;
    }

    let source;
    try {
      source = readFile(join(repoRoot, relPath));
    } catch (err) {
      results.push({ filePath: relPath, issues: [], skipped: true, unreadable: true, stringCount: 0, reason: `unreadable: ${brief(err?.message)}`, _provider: 'error' });
      continue;
    }

    const strings = extractUserFacingStrings(source);
    const result = await reviewFile({ filePath: relPath, strings, supabaseKey, generate, dryRun });
    results.push(result);

    if (result.failure === 'chain') chainFailuresInARow += 1;
    else if (result.failure === 'parse' || result.skipped === false) chainFailuresInARow = 0;

    if (chainFailuresInARow >= maxConsecutiveFailures) {
      breakerTripped = true;
      notReached = files.length - i - 1;
      break;
    }
  }

  const sum = (pick) => results.reduce((n, r) => n + pick(r), 0);
  const totalIssues = sum((r) => r.issues.length);
  const droppedIssues = sum((r) => r.droppedIssues || 0);
  const totalStrings = sum((r) => r.stringCount || 0);
  const filesWithIssues = results.filter((r) => r.issues.length).length;
  const filesWithCopy = results.filter((r) => r.stringCount > 0).length;
  const filesReviewed = results.filter((r) => r.skipped === false).length;
  const reviewFailures = results.filter((r) => r.failure).length;
  const filesScanned = results.length;

  let status = 'completed';
  let errorMessage = null;
  if (dryRun) {
    status = 'dry_run';
  } else if (files.length === 0) {
    status = 'failed';
    errorMessage = `No screen files found under ${DEFAULT_TARGET_DIRS.join(' or ')}.`;
  } else if (filesReviewed === 0) {
    status = 'skipped';
    errorMessage = breakerTripped
      ? `The AI chain did not answer ${maxConsecutiveFailures} times in a row.`
      : reviewFailures
        ? 'Every review attempt failed.'
        : stoppedEarly
          ? 'The time budget ran out before the first file.'
          : 'No file had on-screen text to review.';
  }

  const where = `${filesScanned} of ${files.length} file(s) scanned`;
  let summary;
  if (status === 'dry_run') {
    summary =
      `AXON UI Copy dry run: ${where}, ${filesWithCopy} with on-screen text (${totalStrings} string(s)). ` +
      'No model was called and nothing was written.';
  } else if (status === 'failed') {
    summary = `AXON UI Copy review FAILED: ${errorMessage}`;
  } else if (status === 'skipped') {
    summary = `AXON UI Copy review SKIPPED: no file was reviewed. ${errorMessage} ${where}.`;
  } else {
    summary =
      `AXON UI Copy review: reviewed ${filesReviewed} of ${filesWithCopy} file(s) with on-screen text (${where}), ` +
      `${filesWithIssues} with issues (${totalIssues} total)` +
      (reviewFailures ? `, ${reviewFailures} review(s) failed` : '') +
      (droppedIssues ? `, ${droppedIssues} unusable model suggestion(s) dropped` : '') +
      (breakerTripped
        ? `, stopped after ${maxConsecutiveFailures} failed model calls in a row (${notReached} file(s) not reached)`
        : '') +
      (stoppedEarly ? `, stopped before "${stoppedEarly}" (time budget)` : '') +
      '.';
  }

  let runId = null;
  if (!dryRun) {
    const runRow = await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: UI_COPY_LANE_ID,
      findingsCount: totalIssues,
      briefingItemsAdded: 0,
      status,
      errorMessage,
      summary,
      meta: {
        files_scanned: filesScanned,
        files_total: files.length,
        files_with_copy: filesWithCopy,
        files_reviewed: filesReviewed,
        review_failures: reviewFailures,
        files_with_issues: filesWithIssues,
        dropped_issues: droppedIssues,
        stopped_early_at: stoppedEarly,
        breaker_tripped: breakerTripped,
        not_reached: notReached,
        start_offset: startOffset,
        iso_week: isoWeekNumber(now),
      },
    }).catch((err) => {
      console.log(`⚠️ lab-log write failed: ${brief(err?.message)}`);
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

  return {
    results,
    status,
    dryRun,
    filesScanned,
    filesWithCopy,
    filesReviewed,
    reviewFailures,
    filesWithIssues,
    totalIssues,
    droppedIssues,
    stoppedEarly,
    breakerTripped,
    startOffset,
    summary,
    runId,
  };
}

function blocked(what) {
  return async () => {
    throw new Error(`dry run: ${what} is not allowed`);
  };
}

/** Only `--dry-run` is accepted. An unknown flag is reported, never silently ignored. */
export function parseCliArgs(argv = []) {
  const unknown = argv.filter((a) => a !== '--dry-run');
  return { dryRun: argv.includes('--dry-run'), unknown };
}

/**
 * CLI entry, kept here so it is testable without a network. Returns the exit
 * code. Order matters: arguments first, then the dry-run branch (which never
 * touches the database, a key, or a model), then the key check, and only then
 * the database. Failures are recorded in the run log, never sent to JB's chat.
 */
export async function runCli({
  argv = [],
  env = process.env,
  repoRoot = process.cwd(),
  log = console.log,
  logError = console.error,
  deps = {},
  nowMs = () => Date.now(),
} = {}) {
  const startedAt = nowMs();
  const args = parseCliArgs(argv);
  if (args.unknown.length) {
    logError(
      `AXON UI Copy does not know the option "${args.unknown[0]}". The only option is --dry-run, ` +
        'which counts the screen text without calling a model or writing anything.'
    );
    return 2;
  }

  log(`AXON UI Copy review — ${new Date().toISOString()}`);
  const seams = { repoRoot, listFiles: deps.listFiles, readFile: deps.readFile, now: deps.now };

  if (args.dryRun || env.AXON_DRY_RUN === '1') {
    const run = await runUiCopyReview({
      ...seams,
      dryRun: true,
      generate: blocked('a model call'),
      sbInsert: blocked('a database write'),
    });
    log(run.summary);
    return 0;
  }

  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    logError(
      'AXON UI Copy cannot run for real because the database key is not set here, ' +
        'so nothing was reviewed or written. Use --dry-run to only count the screen text.'
    );
    return 1;
  }

  const createSupabaseClient = deps.createSupabaseClient || (await import('./supabase.mjs')).createSupabaseClient;
  const cronGuardShouldSkip = deps.cronGuardShouldSkip || (await import('./axon-cron-guard.mjs')).cronGuardShouldSkip;
  const loadConfig = deps.loadConfig || (await import('./config.mjs')).loadConfig;
  const budgetMs = Math.max(60_000, Number(env.AXON_UI_COPY_TIME_BUDGET_MS || DEFAULT_TIME_BUDGET_MS));
  const { sbSelect, sbInsert } = createSupabaseClient(key);

  try {
    if (await cronGuardShouldSkip(ROUTINE_ID, sbSelect)) return 0;
    const cfg = await loadConfig(sbSelect);
    const dryRun = Boolean(cfg.dryRun);
    const run = await runUiCopyReview({
      ...seams,
      sbInsert,
      supabaseKey: cfg.supabaseKey || key,
      dryRun,
      generate: dryRun ? blocked('a model call') : deps.generate,
      budgetCheck: () => nowMs() - startedAt > budgetMs,
    });
    log(run.summary);
    return run.status === 'failed' ? 1 : 0;
  } catch (err) {
    const message = brief(err?.message);
    logError(`AXON UI Copy stopped unexpectedly: ${message}`);
    await writeResearchRunLabLog(sbInsert, {
      lane: UI_COPY_LANE_ID,
      status: 'failed',
      errorMessage: message,
      summary: 'AXON UI Copy review FAILED: it stopped unexpectedly before finishing.',
    }).catch(() => null);
    return 1;
  }
}
