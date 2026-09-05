#!/usr/bin/env node
/**
 * NVG STOP GATE — harness-enforced, identical in every NVG repo (locked-rule-sync).
 * Canonical copy: nv-vault/.claude/hooks/nvg-stop-gate.mjs. Edit there, copy everywhere.
 *
 * Runs as a Claude Code `Stop` hook. Two mechanical checks before a session may end:
 *
 *  1. PLAIN-ENGLISH GATE (nvg-operator-core §9 "pre-send scan", JB 2026-09-04/05):
 *     the final assistant message is scanned for jargon JB must never read —
 *     table/column names, env constants, job codes, file paths, code filenames,
 *     git shas, routine/session ids, SQL, and words like "row", "heartbeat",
 *     "schema", "payload". Fenced code blocks are exempt (code belongs there).
 *     A hit BLOCKS the stop with the exact offenders so the message gets rewritten.
 *
 *  2. CLOSE-OUT GATE (nvg-operator-core §3 step 5 + loop-engineering beat 3):
 *     a session that did real work (>= WORK_THRESHOLD tool calls) may not end
 *     until `.claude/hooks/nvg-close.mjs` has been run this session (it writes
 *     the marker `.nvg/closeout.ok` after validating the 7 loop answers).
 *
 * Bypass only for JB's own interactive quick sessions: NVG_GATE_OFF=1.
 * A second Stop after a block (stop_hook_active=true) is allowed through so a
 * session can never loop forever — but the block reason is still printed.
 */
import fs from 'node:fs';
import path from 'node:path';

const WORK_THRESHOLD = 6;
const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MARKER = path.join(PROJECT, '.nvg', 'closeout.ok');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function lastAssistantText(transcriptPath) {
  let toolUses = 0; let last = ''; let sawMarkerWrite = false;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { last, toolUses, sawMarkerWrite };
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const msg = j.message || j;
    if ((j.type || msg.role) !== 'assistant' && msg.role !== 'assistant') continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const texts = [];
    for (const c of content) {
      if (c.type === 'tool_use') { toolUses++; if (JSON.stringify(c.input || {}).includes('nvg-close.mjs')) sawMarkerWrite = true; }
      if (c.type === 'text' && c.text) texts.push(c.text);
    }
    if (texts.length) last = texts.join('\n');
  }
  return { last, toolUses, sawMarkerWrite };
}

// --- plain-English rules (shape-based, mirrors scripts/lib/jb-telegram-plain.mjs) ---
const RULES = [
  { re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, label: 'snake_case name (table/column/variable)' },
  { re: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g, label: 'env/constant name' },
  { re: /\b(?:AX|MF|NI|CM|IT|AT|NVG|BUILD|CORE)-[A-Z0-9][A-Z0-9-]*\b/g, label: 'job code' },
  { re: /(?:^|[\s(])[\w.-]*(?:\/[\w.-]+)+\.(?:mjs|cjs|js|ts|tsx|jsx|json|ya?ml|sql|md|sh|py)\b/g, label: 'file path' },
  { re: /\b[\w-]+\.(?:mjs|cjs|tsx?|jsx|ya?ml|sql|sh|py)\b/g, label: 'code filename' },
  { re: /\b(?=[0-9a-f]{7,40}\b)(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b/g, label: 'git sha' },
  { re: /\b(?:trig|session|env|prj|team)_[A-Za-z0-9]{8,}\b/g, label: 'routine/session id' },
  { re: /\b(?:select|insert|update|delete)\s+(?:\*|into|from|set)\b/gi, label: 'SQL' },
  { re: /\b(?:rows?|heartbeat|close-?out row|schema|payload|jsonb|pg_cron|supabase|ni-brain)\b/gi, label: 'backend word' },
];
const ALLOW = new Set(['Match Fit', 'AXON', 'Mac mini', 'NVG', 'NI', 'JB', 'ADHD', 'AI', 'UI', 'UX', 'PR', 'CI', 'URL', 'HTML', 'API']);

function stripFences(t) {
  return String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}
function scan(text) {
  const prose = stripFences(text);
  const hits = [];
  for (const { re, label } of RULES) {
    re.lastIndex = 0;
    for (const m of prose.matchAll(re)) {
      const tok = m[0].trim();
      if (ALLOW.has(tok)) continue;
      hits.push(`${label}: "${tok.slice(0, 60)}"`);
      if (hits.length >= 12) return hits;
    }
  }
  return hits;
}

function main() {
  if (process.env.NVG_GATE_OFF === '1') return;
  const input = readStdin();
  const { last, toolUses, sawMarkerWrite } = lastAssistantText(input.transcript_path);
  const reasons = [];

  const hits = scan(last);
  if (hits.length) {
    reasons.push(
      'PLAIN-ENGLISH GATE: your last message contains jargon JB must not read. Rewrite those lines in plain terms (what it means for him, what to tap) or move them into a fenced code block. Hits:\n  - ' + hits.join('\n  - ')
    );
  }

  let markerFresh = false;
  try {
    const st = fs.statSync(MARKER);
    markerFresh = Date.now() - st.mtimeMs < 12 * 3600 * 1000;
  } catch { /* no marker */ }
  if (toolUses >= WORK_THRESHOLD && !markerFresh && !sawMarkerWrite) {
    reasons.push(
      `CLOSE-OUT GATE: this session did real work (${toolUses} tool calls) and has not closed the loop. Run: node .claude/hooks/nvg-close.mjs --json '<answers>' with worked / broke / why / fix / tries (was it 10 routes?) / regressed / instruction_change / deliverables / done_proof, then insert the printed close-out into the brain (or confirm the script did). Then end the session.`
    );
  }

  if (!reasons.length) return;
  if (input.stop_hook_active) {
    process.stdout.write(JSON.stringify({ systemMessage: 'NVG stop gate: allowed through after one block. Unresolved: ' + reasons.join(' | ').slice(0, 800) }));
    return;
  }
  process.stdout.write(JSON.stringify({ decision: 'block', reason: reasons.join('\n\n') }));
}
main();
