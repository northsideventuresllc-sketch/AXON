#!/usr/bin/env node
/**
 * AXON-HISTORY-EXPORT (FRONTIER-08-TRAIN-AXON-ON-OUR-HISTORY) — first slice.
 *
 * Exports NI-Brain's Decisions / Learnings / Context rows into local JSONL
 * files shaped for local AXON (Ollama) fine-tuning / retrieval-context corpus
 * building. Read-only against NI-Brain — never writes back to Supabase, never
 * calls RunPod, OpenRouter, Gemini or Anthropic, never uploads anywhere.
 *
 * DRY-RUN IS THE DEFAULT: with no --write flag this only prints counts and a
 * few sample lines to stdout. Pass --write to actually create files, and they
 * land under a git-ignored local-only directory (var/axon-history-export/) —
 * this script never stages or commits its own output.
 *
 * Usage:
 *   node scripts/axon-history-export.mjs                # dry run (default)
 *   node scripts/axon-history-export.mjs --write         # writes JSONL files
 *   node scripts/axon-history-export.mjs --write --limit 500
 *   node scripts/axon-history-export.mjs --since 2026-08-01
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY as a read-only
 * fallback) must be set for the live-fetch path; with neither set, the
 * exported functions still work against an injected fetcher (see tests) so
 * this file has no hidden network requirement for its pure logic.
 *
 * Brand: Northside · Operator: JB
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'var', 'axon-history-export');

export const SOURCES = [
  { table: 'Decisions', kind: 'decision', textFields: ['decision', 'reasoning', 'rationale'] },
  { table: 'Learnings', kind: 'learning', textFields: ['learning', 'context'] },
  { table: 'Context', kind: 'context', textFields: ['summary', 'content', 'context'] },
];

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
}

/** Default fetcher: read-only PostgREST GET against one NI-Brain table. Never throws. */
async function defaultFetchRows(table, { key, limit, since }) {
  try {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (since) params.set('created_at', `gte.${since}`);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      headers: hdrs(key),
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function firstNonEmpty(row, fields) {
  for (const f of fields) {
    const v = row?.[f];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function clip(text, n = 4000) {
  const s = String(text || '').replace(/\r\n/g, '\n').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/**
 * Shape one raw NI-Brain row into a training example: an instruction-style
 * record an eventual local fine-tune / RAG index can consume directly.
 * Pure function — no I/O, easy to unit test.
 */
export function toTrainingRecord(row, kind, textFields) {
  const text = clip(firstNonEmpty(row, textFields));
  if (!text) return null;
  return {
    kind,
    source_id: row.id ?? null,
    project: row.project ?? row.category ?? null,
    created_at: row.created_at ?? null,
    prompt: `Recall an NVG ${kind} relevant to: ${row.project || row.category || 'general operations'}.`,
    completion: text,
  };
}

/** Turn a list of raw rows for one source into training records, dropping empties. */
export function buildRecordsForSource(rows, { kind, textFields }) {
  const out = [];
  for (const row of rows || []) {
    const rec = toTrainingRecord(row, kind, textFields);
    if (rec) out.push(rec);
  }
  return out;
}

function toJsonl(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}

/**
 * Run the export. Injectable fetchRows for tests; defaults to the live
 * PostgREST read. Returns a summary object regardless of dryRun so callers
 * (and tests) can assert on counts without touching the filesystem.
 */
export async function runExport({
  limit = 200,
  since = null,
  write = false,
  outDir = DEFAULT_OUT_DIR,
  fetchRows = defaultFetchRows,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
} = {}) {
  const perSource = [];
  let total = 0;

  for (const source of SOURCES) {
    const rows = await fetchRows(source.table, { key, limit, since });
    const records = buildRecordsForSource(rows, source);
    perSource.push({ table: source.table, kind: source.kind, rowCount: rows.length, recordCount: records.length, records });
    total += records.length;
  }

  const summary = {
    dryRun: !write,
    total,
    perSource: perSource.map(({ table, kind, rowCount, recordCount }) => ({ table, kind, rowCount, recordCount })),
    outDir: write ? outDir : null,
    writtenFiles: [],
  };

  if (write) {
    await mkdir(outDir, { recursive: true });
    for (const s of perSource) {
      const file = path.join(outDir, `${s.kind}.jsonl`);
      await writeFile(file, toJsonl(s.records), 'utf8');
      summary.writtenFiles.push(file);
    }
    const manifest = {
      generated_at: new Date().toISOString(),
      total,
      perSource: summary.perSource,
      note: 'Local-only training corpus export. Never uploaded automatically — see FRONTIER-08-TRAIN-AXON-ON-OUR-HISTORY.',
    };
    const manifestFile = path.join(outDir, 'manifest.json');
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    summary.writtenFiles.push(manifestFile);
  }

  return { summary, perSource };
}

function parseArgs(argv) {
  const out = { write: false, limit: 200, since: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--limit') out.limit = Number(argv[++i]) || out.limit;
    else if (a === '--since') out.since = argv[++i] || null;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { summary } = await runExport(args);

  console.log(`[axon-history-export] mode: ${summary.dryRun ? 'DRY RUN (no files written — pass --write to write)' : 'WRITE'}`);
  for (const s of summary.perSource) {
    console.log(`  ${s.table}: ${s.rowCount} rows read -> ${s.recordCount} training records`);
  }
  console.log(`  total training records: ${summary.total}`);
  if (!summary.dryRun) {
    console.log(`  wrote ${summary.writtenFiles.length} file(s) to ${summary.outDir}`);
    for (const f of summary.writtenFiles) console.log(`    - ${f}`);
  }
  console.log('[axon-history-export] local-only — nothing here uploads, trains, or calls any model API.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error('[axon-history-export] failed:', err?.message || err);
    process.exitCode = 1;
  });
}
