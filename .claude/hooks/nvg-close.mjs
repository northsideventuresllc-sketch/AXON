#!/usr/bin/env node
/**
 * NVG CLOSE — the concrete learning loop, identical in every NVG repo (locked-rule-sync).
 * Canonical copy: nv-vault/.claude/hooks/nvg-close.mjs. Edit there, copy everywhere.
 *
 * JB 2026-09-05: "It can't just be 'write a decision or learning and hope it sticks'."
 * Every session answers the same seven questions, in a fixed shape, and the answers
 * go to the brain the same way every time — so the next run of ANY agent reads them.
 *
 * Usage (from the agent, at the end of every real task):
 *   node .claude/hooks/nvg-close.mjs --json '{
 *     "agent": "EXEC", "workspace_type": "exec", "task": "one line",
 *     "deliverables": ["what was owed"], "done_proof": ["branch/file/row/url per deliverable"],
 *     "worked": ["..."], "broke": ["..."], "why": ["root cause, not symptom"],
 *     "fix": ["the row/gate/skill/file that now prevents it"],
 *     "tries": {"blocked_items": 0, "routes_tried": 0},
 *     "regressed": ["anything that used to work and now does not"],
 *     "instruction_change": [{"target": "_Command Center/Agents/EXEC.md", "change": "plain-English proposed edit", "why": "..."}],
 *     "carry_forward": ["open items for the next run"]
 *   }'
 *
 * What it does, in order:
 *   1. Validates every key exists (empty arrays are fine; missing keys are not).
 *   2. Writes .nvg/closeout.ok (the Stop gate reads this) + .nvg/closeout-<ts>.json.
 *   3. If SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY is in the environment:
 *        - inserts the session_notes_apartment row (raw tier),
 *        - inserts one Learnings row per `fix` and per `regressed` (structured tier),
 *        - posts one agent_bus row to ARCEUS per `instruction_change` (ARCEUS → council → Telegram only if JB must decide),
 *      and prints the ids. Otherwise it prints the exact rows for the agent to insert
 *      with its Supabase tool, and appends them to .nvg/closeout-queue.jsonl so nothing is lost.
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const REQUIRED = ['agent', 'workspace_type', 'task', 'deliverables', 'done_proof', 'worked', 'broke', 'why', 'fix', 'tries', 'regressed', 'instruction_change', 'carry_forward'];

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; }

async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json(); return rows[0];
}

function buildRows(a) {
  const date = new Date().toISOString().slice(0, 10);
  const raw = [
    `CLOSE-OUT ${a.agent} — ${a.task}`,
    `DELIVERABLES: ${a.deliverables.join(' | ') || 'none'}`,
    `PROOF: ${a.done_proof.join(' | ') || 'none'}`,
    `WORKED: ${a.worked.join(' | ') || 'none'}`,
    `BROKE: ${a.broke.join(' | ') || 'none'}`,
    `WHY: ${a.why.join(' | ') || 'none'}`,
    `FIX: ${a.fix.join(' | ') || 'none'}`,
    `TRIES: ${a.tries.blocked_items || 0} item(s) blocked after ${a.tries.routes_tried || 0} route(s)`,
    `REGRESSED: ${a.regressed.join(' | ') || 'none'}`,
    `INSTRUCTION CHANGES REQUESTED: ${a.instruction_change.length}`,
    `CARRY FORWARD: ${a.carry_forward.join(' | ') || 'none'}`,
  ].join('\n');
  const apartment = { session_date: date, workspace_type: a.workspace_type, raw_note: raw };
  const learnings = [
    ...a.fix.map((f, i) => ({ learning: `[LEARNED] ${a.agent} ${date}: ${a.broke[i] || a.broke[0] || 'issue'} — why: ${a.why[i] || a.why[0] || 'n/a'} — fix now in place: ${f}`, source: `${a.agent} close-out`, category: 'loop', project: a.workspace_type })),
    ...a.regressed.map((r) => ({ learning: `[REGRESSION] ${a.agent} ${date}: ${r} — regressed; SENSEI/owner must fix in the next run, not note it.`, source: `${a.agent} close-out`, category: 'regression', project: a.workspace_type })),
  ];
  const bus = a.instruction_change.map((c) => ({
    from_agent: a.agent, to_agent: 'ARCEUS', subject: `INSTRUCTION-CHANGE: ${String(c.target).slice(0, 90)}`,
    body: { kind: 'instruction_change_request', target: c.target, change: c.change, why: c.why, requested_by: a.agent, task: a.task, date, route: 'ARCEUS → council → Telegram only if JB must decide' },
    needs_answer: true, status: 'open',
  }));
  return { apartment, learnings, bus };
}

async function main() {
  const jsonArg = arg('--json') || (arg('--file') ? fs.readFileSync(arg('--file'), 'utf8') : null);
  if (!jsonArg) { console.error('usage: nvg-close.mjs --json <answers> | --file <path>'); process.exit(1); }
  let a; try { a = JSON.parse(jsonArg); } catch (e) { console.error('close-out JSON invalid: ' + e.message); process.exit(1); }
  const missing = REQUIRED.filter((k) => !(k in a));
  if (missing.length) { console.error('close-out incomplete — missing: ' + missing.join(', ')); process.exit(2); }
  for (const k of ['deliverables', 'done_proof', 'worked', 'broke', 'why', 'fix', 'regressed', 'instruction_change', 'carry_forward']) if (!Array.isArray(a[k])) { console.error(`${k} must be an array`); process.exit(2); }
  if (a.deliverables.length && a.done_proof.length < a.deliverables.length) { console.error('every deliverable needs a proof line (done_proof shorter than deliverables)'); process.exit(2); }

  const rows = buildRows(a);
  const dir = path.join(PROJECT, '.nvg'); fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `closeout-${ts}.json`), JSON.stringify({ answers: a, rows }, null, 2));
  fs.writeFileSync(path.join(dir, 'closeout.ok'), ts);

  if (KEY) {
    const out = { apartment: (await sbInsert('session_notes_apartment', rows.apartment)).id, learnings: [], bus: [] };
    for (const l of rows.learnings) out.learnings.push((await sbInsert('Learnings', l)).id);
    for (const b of rows.bus) out.bus.push((await sbInsert('agent_bus', b)).id);
    console.log('close-out written to the brain: ' + JSON.stringify(out));
  } else {
    fs.appendFileSync(path.join(dir, 'closeout-queue.jsonl'), JSON.stringify(rows) + '\n');
    console.log('NO BRAIN KEY IN ENV — insert these with your Supabase tool now (session_notes_apartment, Learnings, agent_bus), then you are closed:');
    console.log(JSON.stringify(rows, null, 2));
  }
}
main().catch((e) => { console.error('close-out failed: ' + e.message); process.exit(3); });
