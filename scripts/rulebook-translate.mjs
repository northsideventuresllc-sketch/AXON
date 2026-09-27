#!/usr/bin/env node
/**
 * FRONTIER-04-ONE-RULEBOOK-EVERYWHERE — the rule translator (#577's sibling
 * mechanism: #577 scheduled a drift check; this script is the thing that
 * actually renders the compiled rulebook).
 *
 * Reads every canonical, active unit under _meta/rulebook/units/*.md
 * (YAML frontmatter + markdown body, per #548), and renders a single
 * compiled block grouped by priority (must / should / nice). That block gets
 * written into a target file between `<!-- RULEBOOK:BEGIN -->` /
 * `<!-- RULEBOOK:END -->` markers — creating the markers on first run if the
 * file doesn't have them yet, replacing only what's between them on repeat
 * runs (idempotent, safe to re-run nightly from the mini cron manifest).
 *
 * Usage:
 *   node scripts/rulebook-translate.mjs --units-dir _meta/rulebook/units \
 *     --target CLAUDE.md [--scope-agent ALL] [--check]
 *
 * --check: don't write, just report whether the target's current block
 * matches what would be rendered (the "drift check" #577's schedule calls
 * for). Exits 1 on drift, 0 if clean or the file has no markers yet.
 */
import fs from 'node:fs';
import path from 'node:path';

const BEGIN = '<!-- RULEBOOK:BEGIN -->';
const END = '<!-- RULEBOOK:END -->';
const PRIORITY_ORDER = ['must', 'should', 'nice'];

// ---------- pure parsing/rendering (unit-tested) ----------

/** Minimal YAML-frontmatter parser for the flat scalar/array fields the
 *  rulebook units actually use — not a general YAML parser on purpose. */
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const [, fm, body] = m;
  const meta = {};
  for (const line of fm.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line) && !line.trim().startsWith('-')) continue;
    const kv = line.match(/^([\w.]+):\s?(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    let val = rawVal.trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      val = val.replace(/^"|"$/g, '');
    }
    meta[key] = val;
  }
  return { meta, body: body.trim() };
}

export function loadUnits(unitsDir, readDirFn = fs.readdirSync, readFileFn = fs.readFileSync) {
  const files = readDirFn(unitsDir).filter((f) => f.endsWith('.md')).sort();
  return files.map((f) => {
    const raw = readFileFn(path.join(unitsDir, f), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    return { file: f, ...meta, body };
  });
}

export function selectCanonicalActive(units, { scopeAgent } = {}) {
  return units.filter((u) => {
    if (u.status !== 'active') return false;
    if (u.canonical !== 'true' && u.canonical !== true) return false;
    if (scopeAgent && Array.isArray(u.scope_agents) && !u.scope_agents.includes('ALL') && !u.scope_agents.includes(scopeAgent)) return false;
    return true;
  });
}

/** Returns the first paragraph of a unit body (text up to the first blank
 *  line), with any hard-wrapped lines inside it joined by single spaces —
 *  instead of truncating at the body's first newline, which cut a wrapped
 *  first sentence off mid-word. */
export function firstParagraph(body) {
  const text = (body || '').replace(/\r\n/g, '\n');
  const firstBlank = text.search(/\n[ \t]*\n/);
  const para = firstBlank === -1 ? text : text.slice(0, firstBlank);
  return para.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
}

export function renderRulebookBlock(units) {
  const lines = [BEGIN];
  lines.push('<!-- Rendered by scripts/rulebook-translate.mjs from _meta/rulebook/units — DO NOT hand-edit between the markers. Edit the source unit, re-run the translator. -->');
  for (const priority of PRIORITY_ORDER) {
    const group = units.filter((u) => u.priority === priority).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    if (group.length === 0) continue;
    lines.push('');
    lines.push(`### ${priority.toUpperCase()}`);
    for (const u of group) {
      lines.push(`- **${u.id}** — ${u.title || ''}: ${firstParagraph(u.body)}`);
    }
  }
  lines.push('');
  lines.push(END);
  return lines.join('\n');
}

export function spliceIntoTarget(existingContent, block) {
  const hasMarkers = existingContent.includes(BEGIN) && existingContent.includes(END);
  if (hasMarkers) {
    const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
    return { content: existingContent.replace(re, block), created: false };
  }
  const sep = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return { content: existingContent + sep + block + '\n', created: true };
}

export function extractCurrentBlock(existingContent) {
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  const m = existingContent.match(re);
  return m ? m[0] : null;
}

// ---------- CLI ----------

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

function main() {
  const unitsDir = arg('--units-dir', '_meta/rulebook/units');
  const target = arg('--target');
  const scopeAgent = arg('--scope-agent');
  const checkOnly = process.argv.includes('--check');
  if (!target) {
    console.error('Usage: node scripts/rulebook-translate.mjs --target <file> [--units-dir dir] [--scope-agent ALL] [--check]');
    process.exit(2);
  }
  const units = selectCanonicalActive(loadUnits(unitsDir), { scopeAgent });
  const block = renderRulebookBlock(units);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';

  if (checkOnly) {
    const current = extractCurrentBlock(existing);
    if (current === null) {
      console.log(`rulebook-translate: ${target} has no RULEBOOK markers yet — nothing to drift-check.`);
      process.exit(0);
    }
    const drift = current.trim() !== block.trim();
    console.log(drift ? `DRIFT: ${target} rulebook block is stale (${units.length} live units).` : `CLEAN: ${target} rulebook block matches ${units.length} live units.`);
    process.exit(drift ? 1 : 0);
  }

  const { content, created } = spliceIntoTarget(existing, block);
  fs.writeFileSync(target, content);
  console.log(`rulebook-translate: wrote ${units.length} units into ${target} (${created ? 'markers created' : 'block replaced'}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
