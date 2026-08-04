/**
 * PORTAL DELETE GUARD — HEALTH-PORTAL-SYNC-DELETES.
 *
 * WHAT WENT WRONG (proven 2026-07-28 23:51 UTC, sync commit 7d4e12e):
 * the sync copied older AXON lib files over the portal ones and thereby DELETED
 * sbRpc + sbDelete (supabase.mjs), clearChatHistory + deleteChatMessages
 * (axon-profile.ts) and the `since` parameter on fetchCompletedDispatches
 * (agent-dispatch.ts), leaving every caller in the portal behind. The NI-Portal
 * production build exited 1 on three separate errors and prod sat on a stale
 * deployment.
 *
 * THE SHAPE OF THE BUG: this sync deletes by OVERWRITING. Nothing compared what the
 * destination file exported before against what the incoming file exports, so a
 * removal was silent right up until a production build failed. There was also a
 * literal unlinkSync() for "stale" files with no check that anything still imported
 * them.
 *
 * WHAT THIS MODULE DOES: given a planned write, it reports which exported symbols
 * would disappear and which portal files still import them. The sync then refuses
 * the whole run — writing nothing at all — instead of committing a silent delete.
 *
 * Deliberately conservative: when it cannot parse something it reports the symbol as
 * removed rather than assuming it survived. A false alarm costs one workflow re-run;
 * a missed one costs production.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVE_ORDER = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

/** Every exported binding name in a TS/JS source, plus 'default' when present. */
export function exportedSymbols(source) {
  const names = new Set();
  if (!source) return names;

  // export [async] function NAME / export class NAME / export const|let|var NAME
  for (const m of source.matchAll(/^\s*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export type X / export interface X / export enum X
  for (const m of source.matchAll(/^\s*export\s+(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export { a, b as c } [from '...']
  for (const m of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const asMatch = piece.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
      const name = asMatch ? asMatch[1] : piece.replace(/^type\s+/, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  if (/^\s*export\s+default\b/m.test(source)) names.add('default');
  return names;
}

/** Named bindings a source imports from each module specifier. */
export function importedBindings(source) {
  const out = []; // { spec, names: Set<string> }
  const push = (spec, names) => out.push({ spec, names });

  // import X, { a, b as c } from 'spec'   /   import * as ns from 'spec'
  for (const m of source.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1];
    const spec = m[2];
    const names = new Set();
    const braced = clause.match(/\{([\s\S]*?)\}/);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const piece = part.trim();
        if (!piece) continue;
        const name = piece.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '').split(',')[0]?.trim();
    if (def && /^[A-Za-z_$][\w$]*$/.test(def)) names.add('default');
    // `import * as ns` can reach any export, so treat it as depending on all of them.
    if (/\*\s+as\s+[A-Za-z_$][\w$]*/.test(clause)) names.add('*');
    push(spec, names);
  }

  // export { a } from 'spec'  — a re-export is a consumer too.
  for (const m of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = new Set();
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const name = piece.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
    push(m[2], names);
  }
  for (const m of source.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) push(m[1], new Set(['*']));

  // await import('spec')
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) push(m[1], new Set(['*']));

  return out;
}

function walkCode(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkCode(p, acc);
    else if (CODE_EXT.has(extname(e.name))) acc.push(p);
  }
  return acc;
}

/** Resolve a module specifier from `fromFile` to an absolute path, or null. */
function resolveSpec(spec, fromFile, niRoot) {
  let base;
  if (spec.startsWith('@/')) base = join(niRoot, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // bare package specifier
  for (const suffix of RESOLVE_ORDER) {
    const candidate = base + suffix;
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch { /* ignore */ }
  }
  // The file may be the very one about to be deleted, so also accept an exact
  // extensionless match against a planned destination.
  return base;
}

/**
 * @param {string} niRoot            portal repo root
 * @param {Array<{dest:string, incoming:string|null, label:string}>} planned
 *        incoming === null means the plan DELETES the file outright.
 * @returns {Array<{dest, symbol, importers:string[], label}>} violations
 */
export function findBreakingRemovals(niRoot, planned) {
  const violations = [];

  // Which symbols would each destination lose?
  const losses = new Map(); // absolute dest -> Set(symbol)
  for (const p of planned) {
    if (!existsSync(p.dest)) continue; // brand-new file cannot remove anything
    const before = exportedSymbols(readFileSync(p.dest, 'utf8'));
    const after = p.incoming === null ? new Set() : exportedSymbols(p.incoming);
    const lost = [...before].filter((s) => !after.has(s));
    if (lost.length) losses.set(resolve(p.dest), new Set(lost));
  }
  if (losses.size === 0) return violations;

  const plannedDests = new Set(planned.map((p) => resolve(p.dest)));
  const labelFor = new Map(planned.map((p) => [resolve(p.dest), p.label]));

  // Who still imports them?
  for (const file of walkCode(join(niRoot, 'src'))) {
    const abs = resolve(file);
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const { spec, names } of importedBindings(source)) {
      const target = resolveSpec(spec, file, niRoot);
      if (!target) continue;
      const targetAbs = resolve(target);
      // The importer may be one of the files being replaced — its NEW content is what
      // matters, and that is checked on its own row, so skip self-references only.
      if (targetAbs === abs) continue;
      const lost = losses.get(targetAbs)
        ?? (plannedDests.has(targetAbs) ? losses.get(targetAbs) : undefined);
      if (!lost) continue;
      const hits = names.has('*') ? [...lost] : [...names].filter((n) => lost.has(n));
      for (const symbol of hits) {
        violations.push({
          dest: relative(niRoot, targetAbs),
          symbol,
          importer: relative(niRoot, abs),
          label: labelFor.get(targetAbs) ?? '(unknown)',
        });
      }
    }
  }

  // Collapse per (dest, symbol).
  const grouped = new Map();
  for (const v of violations) {
    const k = `${v.dest}::${v.symbol}`;
    if (!grouped.has(k)) grouped.set(k, { dest: v.dest, symbol: v.symbol, label: v.label, importers: [] });
    grouped.get(k).importers.push(v.importer);
  }
  return [...grouped.values()].sort((a, b) => a.dest.localeCompare(b.dest) || a.symbol.localeCompare(b.symbol));
}

export function formatViolations(violations) {
  const lines = [
    '',
    'SYNC REFUSED — this run would delete exports that the portal still imports.',
    '',
    'Nothing has been written. The portal is untouched.',
    '',
  ];
  for (const v of violations) {
    lines.push(`  ${v.dest}`);
    lines.push(`    removes: ${v.symbol}   (source: ${v.label})`);
    for (const i of [...new Set(v.importers)].slice(0, 8)) lines.push(`    still imported by: ${i}`);
    lines.push('');
  }
  lines.push('This is the 2026-07-28 failure (sync 7d4e12e dropped sbRpc, sbDelete,');
  lines.push('clearChatHistory, deleteChatMessages and the `since` param, and NI-Portal');
  lines.push('production failed to build). Port the symbol back into the AXON file, or');
  lines.push('remove the file from the sync lists. Do not "fix" this by deleting callers.');
  lines.push('');
  return lines.join('\n');
}

export default { exportedSymbols, importedBindings, findBreakingRemovals, formatViolations };
