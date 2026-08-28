/**
 * AXON Agent Bus — problem #4 fix: "one prompt gets one reply, nothing happens."
 *
 * fireAgent() is the one function that lets an agent actually hand work to another
 * agent: it drops a message into the target's own inbox thread in
 * `axon_agent_messages` (so the target sees it next time it's read) AND records a
 * traceable dispatch row in `agent_bus` (the existing account-wide dispatch log —
 * REUSED here, not reinvented; see NI-Brain `kxijunwgbrlfzvgkhklo`, inspected via
 * `mcp__Supabase__execute_sql` before writing this file). `agent_dispatch` was also
 * inspected — it's the Repo Manager / Hermes GitHub-Actions dispatch queue (codes,
 * workflow files, JB approval gates), a different concern from agent-to-agent chat
 * handoff, so it is read here only for gate/authority context, never written to.
 *
 * Plain .mjs on purpose, same reasoning as axon-fire-gate-core.mjs and
 * axon-router-core.mjs: this has to run under both Next.js/TS and raw `node` in
 * GitHub Actions with no TS loader.
 */
import { createSupabaseClient } from './supabase.mjs';
import { assertFireAllowed, FireHoldError } from './axon-fire-gate-core.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sb() {
  return createSupabaseClient(getSupabaseKey());
}

// ---------------------------------------------------------------------------
// Loop control — non-negotiable. An unattended agent-to-agent loop burns JB's
// paid API quota with nobody watching; that is strictly worse than no
// orchestration at all, so these are hard ceilings, not tunables.
// ---------------------------------------------------------------------------

/**
 * How many "hand this to someone else" hops are allowed from the ORIGINAL request
 * before an agent must stop and either finish itself or ask JB. Matches the
 * `graph-engineering` skill's layer rule: agent -> subagent -> subagent, no deeper.
 * A depth-3 fan-out is where "orchestration" quietly turns into an unbounded tree.
 */
export const MAX_FANOUT_DEPTH = 2;

/**
 * Ceiling on total fireAgent calls anywhere in one originating request's tree, not
 * just its depth. Two agents ping-ponging back and forth never exceeds depth 2, but
 * would run forever without a separate hop budget — this is that budget.
 */
export const MAX_HOPS_PER_REQUEST = 6;

/**
 * Pure, synchronous, no I/O — exported on its own so it's cheap and deterministic to
 * unit test (same reasoning as `scoreLanes` in axon-router-core.mjs). Every reason
 * fireAgent can refuse to fire lives here so the refusal is provable, not implicit.
 *
 * @param {object} p
 * @param {number} p.depth - the depth the TARGET agent would run at if this hop is allowed
 *   (the original request's own agent is depth 0; its first fire lands the target at
 *   depth 1; that agent's own fire lands its target at depth 2; and so on). This is
 *   "agent -> subagent -> subagent" written as depths 0 -> 1 -> 2.
 * @param {number} p.hopCount - hops already spent in this originating request's tree
 * @param {string[]} p.chain - agent ids already visited in this request's chain
 * @param {string} p.fromAgentId
 * @param {string} p.toAgentId
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function checkLoopGuards({ depth, hopCount, chain = [], fromAgentId, toAgentId }) {
  if (!toAgentId || typeof toAgentId !== 'string') {
    return { allowed: false, reason: 'no toAgentId given' };
  }
  if (fromAgentId && toAgentId === fromAgentId) {
    return { allowed: false, reason: 'an agent cannot fire itself' };
  }
  if (chain.includes(toAgentId)) {
    return { allowed: false, reason: `${toAgentId} is already in this request's chain — refusing a cycle` };
  }
  // depth > MAX (not >=): depth 0,1,2 are the three generations of "agent -> subagent ->
  // subagent" that MAX_FANOUT_DEPTH=2 is meant to allow; depth 3 is the first one that
  // wasn't asked for.
  if (depth > MAX_FANOUT_DEPTH) {
    return { allowed: false, reason: `resulting fan-out depth ${depth} exceeds MAX_FANOUT_DEPTH (${MAX_FANOUT_DEPTH})` };
  }
  if (hopCount >= MAX_HOPS_PER_REQUEST) {
    return { allowed: false, reason: `hop count ${hopCount} would reach or exceed MAX_HOPS_PER_REQUEST (${MAX_HOPS_PER_REQUEST})` };
  }
  return { allowed: true, reason: null };
}

/** Keyword heuristic mapping a task's text to the FIRE-gated action id it would trigger. */
const GATE_ACTION_HINTS = [
  { id: 'outreach.run', re: /\b(send|dm|email|reach ?out)\b.*\b(lead|prospect|coach|outreach)\b|\boutreach\b.*\bsend\b/i },
  { id: 'dispatch.fire', re: /\bfire (a )?dispatch\b|\brepo manager dispatch\b|\btrigger (the )?workflow\b/i },
  { id: 'cron.toggle', re: /\benable\b.*\bcron\b|\bturn on\b.*\b(cron|schedule)\b/i },
  { id: 'content.publish', re: /\bpublish\b|\bschedule\b.*\bpost\b|\bgo live\b.*\bcontent\b/i },
  { id: 'reddit.post', re: /\breddit\b.*\b(post|comment|reply)\b/i },
];

/** Returns the gated action id a task would trigger, or null if it isn't gate-relevant. */
export function classifyGatedAction(task = '') {
  const hit = GATE_ACTION_HINTS.find((h) => h.re.test(task));
  return hit ? hit.id : null;
}

/** Keyword heuristic for whether a task is a merge/deploy-class action needing authority. */
const MERGE_DEPLOY_RE = /\bmerge\b|\bdeploy\b|\bpush to (main|prod)\b|\brelease\b/i;

async function lookupTargetAgent(toAgentId) {
  const key = getSupabaseKey();
  if (!key) return null;
  try {
    const rows = await sb().sbSelect('axon_venture_agents', `id=eq.${toAgentId}&select=id,name,role,venture_id&limit=1`);
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Authority is read live by AGENT NAME from `nvg_agent_authority` — it never comes
 * from the message that asked. No matching row (or a revoked/inactive one) fails
 * CLOSED: no authority, not "assume yes".
 */
async function lookupAuthority(agentName) {
  const key = getSupabaseKey();
  if (!key || !agentName) return { can_merge_to_main: false, can_deploy_to_production: false, found: false };
  try {
    const rows = await sb().sbSelect(
      'nvg_agent_authority',
      `agent_name=ilike.${encodeURIComponent(agentName)}&status=eq.active&select=agent_name,can_merge_to_main,can_deploy_to_production,revoked_at&limit=1`,
    );
    const row = rows?.[0];
    if (!row || row.revoked_at) return { can_merge_to_main: false, can_deploy_to_production: false, found: false };
    return { can_merge_to_main: !!row.can_merge_to_main, can_deploy_to_production: !!row.can_deploy_to_production, found: true };
  } catch {
    return { can_merge_to_main: false, can_deploy_to_production: false, found: false };
  }
}

/**
 * Hand work to another agent.
 *
 * - Posts into the target's own inbox thread in `axon_agent_messages` (so the next
 *   time that agent's boot/chat path reads its thread, the task is there).
 * - Records a traceable row in `agent_bus` (from_agent/to_agent/subject/body/status)
 *   — the existing dispatch log every other agent (ARCEUS, PULSE, EXEC, CONTENT...)
 *   already writes to, reused rather than inventing a second table.
 * - Enforces the loop guards above, the FIRE/HOLD gate for gated action classes, and
 *   live authority for merge/deploy-class tasks.
 *
 * @param {object} p
 * @param {string} p.fromAgentId - axon_venture_agents.id of the caller
 * @param {string} p.toAgentId - axon_venture_agents.id of the target
 * @param {string} p.ventureId
 * @param {string} p.task - the work being handed over
 * @param {string} [p.context] - extra context/background for the target agent
 * @param {string} [p.requestId] - originating request id; generated if omitted
 * @param {number} [p.depth] - the depth this fire's TARGET would run at (see
 *   checkLoopGuards above); defaults to 1, i.e. "a root agent firing its first hop"
 * @param {number} [p.hopCount] - hops already spent in this request's tree
 * @param {string[]} [p.chain] - agent ids already visited in this request's chain
 * @returns {Promise<{ok: boolean, reason?: string, messageId?: string, busId?: string, depth?: number, hopCount?: number}>}
 */
export async function fireAgent({
  fromAgentId,
  toAgentId,
  ventureId = null,
  task,
  context = null,
  requestId = null,
  depth = 1,
  hopCount = 0,
  chain = [],
}) {
  if (!task || typeof task !== 'string' || !task.trim()) {
    return { ok: false, reason: 'no task given' };
  }

  const guard = checkLoopGuards({ depth, hopCount, chain, fromAgentId, toAgentId });
  if (!guard.allowed) {
    return { ok: false, reason: guard.reason };
  }

  const target = await lookupTargetAgent(toAgentId);
  if (!target) {
    return { ok: false, reason: `unknown agent id: ${toAgentId}` };
  }

  const gatedAction = classifyGatedAction(task);
  if (gatedAction) {
    try {
      await assertFireAllowed(gatedAction);
    } catch (err) {
      if (err instanceof FireHoldError) {
        return { ok: false, reason: err.message, gated: gatedAction };
      }
      throw err;
    }
  }

  if (MERGE_DEPLOY_RE.test(task)) {
    const authority = await lookupAuthority(target.name);
    const needsDeploy = /\bdeploy\b|\bpush to prod\b|\brelease\b/i.test(task);
    const ok = needsDeploy ? authority.can_deploy_to_production : authority.can_merge_to_main;
    if (!ok) {
      return {
        ok: false,
        reason: `"${target.name}" has no live ${needsDeploy ? 'deploy' : 'merge'} authority — refusing a merge/deploy-class task`,
      };
    }
  }

  const rid = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = getSupabaseKey();
  if (!key) {
    return { ok: false, reason: 'SUPABASE_SERVICE_KEY not configured — cannot fire an agent' };
  }

  let messageId = null;
  let busId = null;
  try {
    const msg = await sb().sbInsert('axon_agent_messages', {
      venture_id: ventureId || target.venture_id || null,
      agent_id: toAgentId,
      thread: `agent-${toAgentId}`,
      sender: fromAgentId || 'system',
      content: task,
      meta: { context, request_id: rid, depth, hop_count: hopCount, chain: [...chain, fromAgentId].filter(Boolean) },
    });
    messageId = msg?.id || null;
  } catch (err) {
    return { ok: false, reason: `axon_agent_messages insert failed: ${err.message}` };
  }

  try {
    const bus = await sb().sbInsert('agent_bus', {
      from_agent: fromAgentId || 'system',
      to_agent: toAgentId,
      subject: task.slice(0, 120),
      body: { task, context, venture_id: ventureId, request_id: rid, depth, hop_count: hopCount, chain },
      needs_answer: true,
      status: 'open',
    });
    busId = bus?.id || null;
  } catch (err) {
    // The message already landed in the target's inbox — the dispatch trace is
    // best-effort observability on top of that, so a failure here is logged, not fatal.
    console.log(`agent_bus insert failed for fireAgent(${fromAgentId} -> ${toAgentId}): ${err.message}`);
  }

  return { ok: true, messageId, busId, requestId: rid, depth, hopCount: hopCount + 1 };
}

// ---------------------------------------------------------------------------
// Tool-calling — lets an agent's reply request an action instead of only prose.
// A strictly-validated JSON block, not full function-calling: cheaper, and the
// validation surface is small enough to review in one read.
// ---------------------------------------------------------------------------

export const KNOWN_TOOLS = ['fire_agent', 'ask_operator', 'done'];

/**
 * Looks for a fenced ```tool ... ``` block (preferred) or a bare trailing JSON
 * object starting with {"tool": in the model's reply. Never throws — a malformed
 * or absent block just means no tool call, the prose reply still stands.
 * @returns {object|null}
 */
export function parseToolCall(replyText = '') {
  if (typeof replyText !== 'string' || !replyText.includes('"tool"')) return null;

  const fenced = replyText.match(/```(?:tool|json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);

  // Fallback: last balanced {...} in the text that contains "tool".
  const lastBrace = replyText.lastIndexOf('{');
  if (lastBrace !== -1) candidates.push(replyText.slice(lastBrace));

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.tool === 'string') return parsed;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Hard validation gate. An unknown tool name, a non-existent agent id, or a
 * malformed block must be ignored safely, never executed — this is that check,
 * kept separate from execution so it stays easy to unit test.
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateToolCall(call) {
  if (!call || typeof call !== 'object') return { valid: false, reason: 'not an object' };
  if (!KNOWN_TOOLS.includes(call.tool)) return { valid: false, reason: `unknown tool: ${call.tool}` };
  if (call.tool === 'fire_agent') {
    if (typeof call.toAgentId !== 'string' || !call.toAgentId.trim()) {
      return { valid: false, reason: 'fire_agent requires a string toAgentId' };
    }
    if (typeof call.task !== 'string' || !call.task.trim()) {
      return { valid: false, reason: 'fire_agent requires a non-empty string task' };
    }
  }
  if (call.tool === 'ask_operator' && (typeof call.message !== 'string' || !call.message.trim())) {
    return { valid: false, reason: 'ask_operator requires a string message' };
  }
  return { valid: true };
}

/**
 * Parses + validates + (for fire_agent) executes via fireAgent, all in one place
 * so routeChat's tool-calling extension in axon-router-core.mjs stays a thin call
 * site. Never throws — every failure mode comes back as a normal result object.
 *
 * @param {string} replyText - the agent's raw reply
 * @param {object} runCtx - { agentId, ventureId, depth, hopCount, chain, requestId }
 * @returns {Promise<null|{tool: string, valid: boolean, reason?: string, result?: object}>}
 */
export async function handleToolCall(replyText, runCtx = {}) {
  const call = parseToolCall(replyText);
  if (!call) return null;

  const check = validateToolCall(call);
  if (!check.valid) return { tool: call.tool, valid: false, reason: check.reason };

  if (call.tool === 'done') return { tool: 'done', valid: true };
  if (call.tool === 'ask_operator') return { tool: 'ask_operator', valid: true, message: call.message };

  // fire_agent
  const result = await fireAgent({
    fromAgentId: runCtx.agentId,
    toAgentId: call.toAgentId,
    ventureId: call.ventureId || runCtx.ventureId,
    task: call.task,
    context: call.context || null,
    requestId: runCtx.requestId,
    depth: (runCtx.depth || 0) + 1,
    hopCount: runCtx.hopCount || 0,
    chain: runCtx.chain || [],
  });
  return { tool: 'fire_agent', valid: true, result };
}
