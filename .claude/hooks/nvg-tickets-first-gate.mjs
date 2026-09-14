#!/usr/bin/env node
/**
 * NVG TICKETS-FIRST GATE — mechanical enforcement of "tickets first", identical in every NVG
 * repo (locked-rule-sync). Canonical copy: nv-vault/.claude/hooks/nvg-tickets-first-gate.mjs.
 * Edit there, copy everywhere.
 *
 * WHY THIS EXISTS (JB re-lock 2026-09-07, ticket BUILD-MECHANICAL-TICKETS-FIRST-HOOKS-0907):
 * every agent file already SAYS "clear every open owned ticket before your own work" (BUILD.md
 * "Tickets first", EXEC.md, nvg-boot-contract.sh item 0, Decision #1758 fire-vs-queue). That is
 * prose an agent is trusted to remember, not a gate — and it kept not holding. ARCEUS's
 * 2026-09-07 live re-check found EXEC's own claim that 4 stale-looking items were fixed was
 * wrong for 3 of 4, because nothing forced a live check at the moment of acting. This hook is
 * the enforce-it layer nvg-boot-contract.sh item 0 already promises ("item 0's mechanical block
 * is being wired").
 *
 * RUNS AS: a Claude Code `PreToolUse` hook (matcher "*", every tool).
 *
 * WHAT IT DOES
 *  - Only runs when NVG_AGENT_NAME is set (a named, dispatched agent — BUILD, EXEC, ARCEUS,
 *    etc.). Never fires on JB's own interactive sessions, which have no bus inbox of their own.
 *  - Reads this agent's open tickets: agent_bus rows where to_agent is this agent or 'ALL',
 *    subject starts with "TICKET", status='open' (same shape as v_bus_inbox).
 *  - If any exist and the OLDEST one has not been acknowledged yet, BLOCKS the tool call once,
 *    naming that ticket (id, subject, who filed it, when) and printing the exact command to
 *    acknowledge it before continuing.
 *  - Once acknowledged (see ACK MODE below), that ticket id is remembered locally and this hook
 *    stops blocking on it — it fires the mechanical block ONCE per ticket, not on every tool
 *    call. This is deliberate: per EXEC's 2026-09-07 bus reply ("livelock nuance for the
 *    mechanical build"), tickets-first must not become a self-inflicted denial-of-service when
 *    a ticket genuinely cannot finish this run. Acknowledging is cheap (one command) but
 *    mandatory — the gate still forces the agent to SEE and DECIDE on every open ticket before
 *    doing anything else; it just doesn't re-block every single tool call after that.
 *  - A brand-new ticket that shows up mid-session (ARCEUS/JB fires something urgent) is not
 *    already in the acked list, so it blocks again on the very next tool call — "fire beats
 *    queue" (Decision #1758) stays enforced without a restart.
 *  - FAILS OPEN, always: no SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY in env, a network
 *    error, a timeout, or any unexpected exception -> the hook allows the tool call through and
 *    notes why on stderr. A broken gate must never turn into a stuck agent — see nvg-close.mjs's
 *    same fail-open convention when its brain key is missing.
 *
 * ACK MODE (the agent runs this itself, as a normal Bash tool call, once it has decided what to
 * do about the oldest open ticket):
 *   node .claude/hooks/nvg-tickets-first-gate.mjs --ack <ticket_id> --note "claimed, working it now"
 *   node .claude/hooks/nvg-tickets-first-gate.mjs --ack <ticket_id> --note "parked: needs JB, pinged" --park
 *
 * "--park" is a label only (recorded in the local ack state for the close-out / next run to
 * see) — it does not itself touch agent_bus. The agent still claims the ticket the normal way
 * (fn_bus_claim) and, if it truly cannot finish this run, leaves the real park/blocked reason on
 * the bus row itself, exactly as the boot contract's bug-triage rule already says.
 *
 * Bypass only for JB's own interactive quick sessions: NVG_GATE_OFF=1 (same env var the Stop
 * gate uses).
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_FILE = path.join(PROJECT, '.nvg', 'tickets-gate-state.json');
const AGENT_NAME_FILE = path.join(PROJECT, '.nvg', 'agent-name');

// Resolve the agent name for a fired/scheduled session. Prefer the env var (set by JB
// on the routine/environment if he can); fall back to the file written by
// scripts/nvg-set-agent-name.mjs early in boot. A fired cloud session does NOT expose
// its routine/trigger id (verified 2026-09-08 — not in env, ingress JWT, or git), so
// the name cannot be auto-derived from nvg_agent_routines; the routine prompt is the
// one place it reliably lives, and the file is how the agent hands it to this gate.
// ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908.
function resolveAgentName() {
  const fromEnv = (process.env.NVG_AGENT_NAME || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = fs.readFileSync(AGENT_NAME_FILE, 'utf8').trim();
    // Re-validate the file value (defense-in-depth): the setter validates on write,
    // but a hand-written .nvg/agent-name must not be able to reshape the PostgREST
    // filter this name feeds into. Same allow-list as scripts/nvg-set-agent-name.mjs.
    if (fromFile && /^[A-Za-z0-9 _.-]{1,60}$/.test(fromFile)) return fromFile;
  } catch { /* no name file yet — gate no-ops this call, same as before */ }
  return '';
}

function key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
function flag(name) {
  return process.argv.includes(name);
}

// ---------- state (local, per working tree — same convention as nvg-close.mjs's marker file) ----------
export function loadState(file = STATE_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ackedTicketIds: Array.isArray(raw.ackedTicketIds) ? raw.ackedTicketIds : [],
      blockedTicketIds: Array.isArray(raw.blockedTicketIds) ? raw.blockedTicketIds : [],
      notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    };
  } catch {
    return { ackedTicketIds: [], blockedTicketIds: [], notes: {} };
  }
}
export function saveState(state, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

// ---------- pure decision logic (no network — this is what gets unit-tested) ----------
// Filters raw agent_bus-shaped rows down to this agent's open TICKET rows, oldest first.
export function ticketsFor(rows, agent) {
  return (rows || [])
    .filter((r) => r && typeof r.subject === 'string' && /^ticket/i.test(r.subject.trim()))
    .filter((r) => r.status === 'open')
    .filter((r) => r.to_agent === agent || r.to_agent === 'ALL')
    .filter((r) => !r.dead_lettered_at)
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

// Given this agent's open tickets + local gate state, decide whether to block this tool call.
// Returns { block: false } or { block: true, ticket, reason }.
export function decide(tickets, state) {
  const unacked = tickets.filter((t) => !state.ackedTicketIds.includes(t.id));
  if (!unacked.length) return { block: false };
  const oldest = unacked[0];
  if (state.blockedTicketIds.includes(oldest.id)) {
    // Already surfaced this ticket once this working tree — don't re-block on every tool call
    // (EXEC's livelock nuance). It stays visible via `carry_forward` at close-out instead.
    return { block: false };
  }
  return { block: true, ticket: oldest, reason: buildReason(oldest, unacked.length) };
}

function buildReason(ticket, openCount) {
  const subject = String(ticket.subject || '').slice(0, 140);
  const from = ticket.from_agent || 'unknown';
  const when = ticket.created_at || 'unknown time';
  const more = openCount > 1 ? ` (${openCount - 1} more open ticket(s) behind it)` : '';
  return [
    `TICKETS-FIRST GATE: you have an open owned ticket that has not been acknowledged this run.`,
    `Oldest: "${subject}" — filed by ${from} at ${when} — id ${ticket.id}${more}.`,
    `Clear it (or every open ticket, oldest first) before other work, per BUILD.md/EXEC.md "Tickets first" and Decision #1758.`,
    `If it can be worked now: claim it (fn_bus_claim) and start, then run:`,
    `  node .claude/hooks/nvg-tickets-first-gate.mjs --ack ${ticket.id} --note "claimed, working it now"`,
    `If it genuinely cannot finish this run (needs JB and JB is away, or a hard external blocker): park it on the bus row with the real reason, then run:`,
    `  node .claude/hooks/nvg-tickets-first-gate.mjs --ack ${ticket.id} --note "<why parked>" --park`,
    `Either way, ack once and this tool call — and the rest of this session — proceeds normally; this gate does not re-block the same ticket twice.`,
  ].join('\n');
}

// ---------- network (fetchImpl is injectable so tests never hit the live brain) ----------
export async function fetchOpenTickets(agent, { url = SUPABASE_URL, apiKey = key(), fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('no SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in env');
  // Filter to_agent + subject SERVER-SIDE, not just client-side after the fetch: agent_bus
  // carries a lot of non-ticket traffic (skill-ledger open/close pings, ~50+/day), and an
  // unfiltered query ordered oldest-first with any bounded limit can page past this agent's
  // real tickets entirely before it ever sees one. Caught live 2026-09-07 while proving this
  // hook against the real brain -- see PR description / close-out.
  const qs = new URLSearchParams({
    select: 'id,from_agent,to_agent,subject,status,created_at,expires_at,dead_lettered_at,claimed_by',
    status: 'eq.open',
    dead_lettered_at: 'is.null',
    subject: 'ilike.TICKET*',
    or: `(to_agent.eq.${agent},to_agent.eq.ALL)`,
    order: 'created_at.asc',
    limit: '200',
  });
  const r = await fetchImpl(`${url}/rest/v1/agent_bus?${qs.toString()}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!r.ok) throw new Error(`agent_bus fetch: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return ticketsFor(rows, agent);
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// ---------- ack mode ----------
function runAck() {
  const id = arg('--ack');
  if (!id) {
    console.error('usage: nvg-tickets-first-gate.mjs --ack <ticket_id> [--note "..."] [--park]');
    process.exit(1);
  }
  const note = arg('--note') || '';
  const parked = flag('--park');
  const state = loadState();
  if (!state.ackedTicketIds.includes(id)) state.ackedTicketIds.push(id);
  state.notes[id] = { note, parked, ackedAt: new Date().toISOString() };
  saveState(state);
  console.log(JSON.stringify({ ok: true, acked: id, parked, note }));
}

// ---------- hook mode ----------
async function runGate() {
  if (process.env.NVG_GATE_OFF === '1') return; // JB's own quick sessions
  const agent = resolveAgentName();
  if (!agent) return; // not a named/dispatched agent session (no env var, no name file yet) — nothing to gate

  const input = readStdin(); // PreToolUse payload: session_id, tool_name, tool_input, ...
  void input; // tool identity isn't needed for the decision — every tool call is gated equally

  let tickets;
  try {
    tickets = await fetchOpenTickets(agent);
  } catch (e) {
    process.stderr.write(`nvg-tickets-first-gate: fail-open (${e.message})\n`);
    return; // never block because the check itself failed
  }

  const state = loadState();
  const result = decide(tickets, state);
  if (!result.block) return;

  state.blockedTicketIds.push(result.ticket.id);
  saveState(state);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: result.reason },
      systemMessage: result.reason,
    })
  );
}

async function main() {
  if (flag('--ack')) return runAck();
  await runGate();
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`nvg-tickets-first-gate: unexpected error, failing open (${e.message})\n`);
    process.exit(0);
  });
}
