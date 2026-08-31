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
// Circular by design: axon-router-core.mjs imports `handleToolCall` from this file so a
// fired agent's own reply can request further tool calls. Both routeChat and fireAgent
// are `export async function` declarations (hoisted), and neither is called at module
// -evaluation time — only from inside the other's own async body, well after both modules
// have finished loading — so the cycle resolves cleanly under Node's ESM loader. Proven by
// tests/agent-bus-fire-and-run.test.mjs, which imports this file first and still gets a
// working routeChat reference.
import { routeChat } from './axon-router-core.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sb() {
  return createSupabaseClient(getSupabaseKey());
}

/**
 * Hard wall-clock ceiling for an ENTIRE fire chain (the original hop plus every hop it
 * triggers, recursively) — not per hop. checkLoopGuards' depth/hop ceilings bound how WIDE
 * a chain can get; this bounds how LONG it is allowed to keep the operator waiting even
 * while every individual hop is otherwise within guard. Overridable per call (tests use a
 * short budget on purpose) and via env for a deploy-wide change.
 */
export const DEFAULT_FIRE_CHAIN_BUDGET_MS = Number(process.env.AXON_FIRE_CHAIN_BUDGET_MS) || 90_000;

class FireChainTimeoutError extends Error {}

/** Races a promise against a deadline without cancelling the underlying I/O — Node has no
 * portable way to abort an in-flight fetch inside executeLane from here, so a timeout means
 * "the chain stops waiting on it," not "the network call was cancelled." The agent_bus
 * progress row records that plainly so it never looks resolved. */
function raceWithTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new FireChainTimeoutError(`exceeded ${ms}ms`)), Math.max(ms, 0));
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * agent_bus IS the per-hop progress row (one insert per fireAgent call, unchanged from
 * before) — these two helpers just evolve its `body.progress` field so a stalled chain is
 * visible as a row stuck at "running" instead of nothing at all, without ever inventing a
 * new `status` value the live table might not accept as a check-constraint. `status` only
 * ever moves open -> answered (requirement 4: resolve only on real completion); every other
 * outcome (timeout, failure, refusal) stays `status: 'open'` with the honest reason living
 * in body.progress, on purpose.
 */
async function patchBusProgress(busId, baseBody, progressPatch) {
  if (!busId) return;
  try {
    await sb().sbPatch('agent_bus', `id=eq.${busId}`, {
      body: { ...baseBody, progress: { ...baseBody.progress, ...progressPatch } },
    });
  } catch (err) {
    console.log(`agent_bus progress patch failed for ${busId}: ${err.message}`);
  }
}

async function patchBusResolved(busId, baseBody, { answeredBy, route, elapsedMs }) {
  if (!busId) return;
  const nowIso = new Date().toISOString();
  try {
    await sb().sbPatch('agent_bus', `id=eq.${busId}`, {
      status: 'answered',
      answered_by: answeredBy,
      answered_at: nowIso,
      body: {
        ...baseBody,
        progress: { ...baseBody.progress, state: 'completed', finished_at: nowIso, elapsed_ms: elapsedMs, route },
      },
    });
  } catch (err) {
    console.log(`agent_bus resolve patch failed for ${busId}: ${err.message}`);
  }
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
 * Hand work to another agent — and, unlike the PR #140 version, actually make it happen:
 * after recording the dispatch this runs the target's turn SYNCHRONOUSLY (boot context +
 * routeChat, same as any normal chat turn), persists its reply through the same
 * axon_agent_messages insert every ordinary chat reply lands through, and only then marks
 * the dispatch resolved. Set `runTargetTurn: false` to fall back to the old fire-and-forget
 * behavior (record the dispatch, let the target pick it up whenever it next reads its
 * thread) — nothing in this codebase currently asks for that, but the option exists rather
 * than deleting the capability outright.
 *
 * - Posts into the target's own inbox thread in `axon_agent_messages` (so the next
 *   time that agent's boot/chat path reads its thread, the task is there) — unchanged.
 * - Records a traceable row in `agent_bus` (from_agent/to_agent/subject/body/status)
 *   — the existing dispatch log every other agent (ARCEUS, PULSE, EXEC, CONTENT...)
 *   already writes to, reused rather than inventing a second table. That row now also
 *   doubles as the per-hop progress row: `body.progress.state` moves
 *   dispatched -> running -> completed/timeout/failed, so a stalled chain shows up as a
 *   row stuck mid-flight instead of vanishing silently.
 * - Enforces the loop guards above, the FIRE/HOLD gate for gated action classes, and
 *   live authority for merge/deploy-class tasks — unchanged, and the target's own turn
 *   runs INSIDE this same envelope: any fire_agent tool call in its reply goes back
 *   through handleToolCall -> fireAgent -> checkLoopGuards with this hop's
 *   depth/hopCount/chain carried forward, so nested fires are re-checked by the exact
 *   same guard code, never a re-implementation of it.
 * - Enforces a hard wall-clock budget (DEFAULT_FIRE_CHAIN_BUDGET_MS, overridable) across
 *   the WHOLE chain, not just this hop — set once at the first hop and threaded through
 *   every nested fire so a chain can't out-wait the operator even while every individual
 *   depth/hop guard above still passes.
 * - Resolves the dispatch (`agent_bus.status = 'answered'`) ONLY when the target's turn
 *   actually completed and its reply was persisted. A timeout, a provider failure, or a
 *   refusal from the target's own turn leaves the row honestly un-resolved
 *   (`status` stays `'open'`) with the reason recorded in `body.progress`.
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
 * @param {number|null} [p.chainDeadline] - epoch ms the WHOLE chain must finish by; set
 *   once at the first hop (left null) and passed unchanged on every nested hop
 * @param {number} [p.chainBudgetMs] - budget used to compute chainDeadline when it is
 *   null (i.e. this is the first hop of a new chain)
 * @param {boolean} [p.runTargetTurn] - false to fall back to fire-and-forget (dispatch
 *   only, no synchronous turn, no resolve) — default true
 * @param {string|null} [p.accountId] - passed straight through to the target's routeChat
 *   call; null falls open to the global lane catalog, same as any raw-script caller
 * @returns {Promise<{ok: boolean, resolved?: boolean, reason?: string, messageId?: string,
 *   replyMessageId?: string, busId?: string, depth?: number, hopCount?: number,
 *   reply?: string, route?: string}>}
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
  chainDeadline = null,
  chainBudgetMs = DEFAULT_FIRE_CHAIN_BUDGET_MS,
  runTargetTurn = true,
  accountId = null,
}) {
  if (!task || typeof task !== 'string' || !task.trim()) {
    return { ok: false, reason: 'no task given' };
  }

  const guard = checkLoopGuards({ depth, hopCount, chain, fromAgentId, toAgentId });
  if (!guard.allowed) {
    return { ok: false, reason: guard.reason };
  }

  // Whole-chain wall-clock budget — set once (first hop of a chain) and carried forward
  // unchanged on every nested hop via routeChat's chainDeadline -> handleToolCall's runCtx
  // -> this same parameter. Refused here, before any I/O, if the chain has already run out
  // of time; the LAST hop's agent_bus row is what stays visibly stuck, not this refusal.
  const effectiveDeadline = chainDeadline || Date.now() + chainBudgetMs;
  if (Date.now() >= effectiveDeadline) {
    return {
      ok: false,
      reason: `fire chain wall-clock budget (${chainBudgetMs}ms) already exhausted — refusing this hop`,
    };
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

  // This row is now also the per-hop progress row (requirement: "a progress row per hop
  // so a stalled chain is visible instead of silent") — body.progress.state evolves below
  // as this hop actually runs, so a chain that stalls shows up as a row stuck mid-state.
  const busBody = {
    task,
    context,
    venture_id: ventureId,
    request_id: rid,
    depth,
    hop_count: hopCount,
    chain,
    progress: { state: 'dispatched', dispatched_at: new Date().toISOString() },
  };
  try {
    const bus = await sb().sbInsert('agent_bus', {
      from_agent: fromAgentId || 'system',
      to_agent: toAgentId,
      subject: task.slice(0, 120),
      body: busBody,
      needs_answer: true,
      status: 'open',
    });
    busId = bus?.id || null;
  } catch (err) {
    // The message already landed in the target's inbox — the dispatch trace is
    // best-effort observability on top of that, so a failure here is logged, not fatal.
    console.log(`agent_bus insert failed for fireAgent(${fromAgentId} -> ${toAgentId}): ${err.message}`);
  }

  const dispatchResult = {
    ok: true,
    resolved: false,
    messageId,
    busId,
    requestId: rid,
    depth,
    hopCount: hopCount + 1,
  };

  if (!runTargetTurn) {
    // Old fire-and-forget behavior, opted into explicitly — the dispatch is recorded and
    // the target picks it up whenever it next reads its own thread, same as before this fix.
    return { ...dispatchResult, reason: 'delivered — runTargetTurn=false, target turn not run synchronously' };
  }

  // --- Run the target's turn SYNCHRONOUSLY, inside the SAME guard envelope -----------
  // routeChat(agentId: toAgentId) does its own buildAgentBootContext() call internally
  // (axon-router-core.mjs already does this for every agentId-bearing call, so there is
  // nothing extra to wire up here) and, if the reply itself contains a fire_agent tool
  // call, routeChat's own handleToolCall hands it straight back to fireAgent with THIS
  // hop's depth/hopCount/chain carried forward — so checkLoopGuards runs again on every
  // nested hop via the one code path, never a second implementation of it.
  const turnStartedAt = Date.now();
  const timeLeftMs = effectiveDeadline - turnStartedAt;
  if (timeLeftMs <= 0) {
    await patchBusProgress(busId, busBody, {
      state: 'timeout',
      reason: 'no time left in the fire-chain budget before the target turn could start',
    });
    return { ...dispatchResult, reason: 'fire chain wall-clock budget exhausted before the target turn could start' };
  }

  await patchBusProgress(busId, busBody, { state: 'running', started_at: new Date(turnStartedAt).toISOString() });
  const nextChain = [...chain, fromAgentId].filter(Boolean);

  try {
    const routed = await raceWithTimeout(
      routeChat(key, {
        messages: [{ role: 'user', content: task }],
        mode: 'auto',
        accountId,
        agentId: toAgentId,
        agentRole: target.role || '',
        venture: ventureId || target.venture_id || null,
        requestId: rid,
        agentChain: nextChain,
        agentDepth: depth,
        agentHopCount: hopCount + 1,
        chainDeadline: effectiveDeadline,
      }),
      timeLeftMs,
    );

    // Persist the reply through the SAME insert every ordinary chat reply lands through
    // (see app/api/axon-v0/agent-chat/route.ts's addMessage call) — same table, same
    // thread convention, same shape, just called directly here since this file has to
    // stay importable from raw `node` with no Next.js/TS loader (see file header).
    let replyMessageId = null;
    try {
      const replyMsg = await sb().sbInsert('axon_agent_messages', {
        venture_id: ventureId || target.venture_id || null,
        agent_id: toAgentId,
        thread: `agent-${toAgentId}`,
        sender: target.name,
        content: routed.reply,
        meta: {
          request_id: rid,
          depth,
          hop_count: hopCount,
          in_reply_to: messageId,
          route: routed.route,
          capability: routed.capabilityClass,
          decision_id: routed.decisionId,
        },
      });
      replyMessageId = replyMsg?.id || null;
    } catch (err) {
      // The target's turn genuinely completed, but nobody can see the reply — that is
      // exactly the "honest un-resolved state" requirement 4 asks for: do NOT mark the
      // dispatch answered when the reply itself never landed anywhere visible.
      await patchBusProgress(busId, busBody, {
        state: 'failed',
        reason: `target turn completed but its reply could not be persisted: ${err.message}`,
        elapsed_ms: Date.now() - turnStartedAt,
      });
      return { ...dispatchResult, reason: `reply persist failed: ${err.message}` };
    }

    await patchBusResolved(busId, busBody, {
      answeredBy: target.name,
      route: routed.route,
      elapsedMs: Date.now() - turnStartedAt,
    });

    return {
      ok: true,
      resolved: true,
      messageId,
      replyMessageId,
      busId,
      requestId: rid,
      depth,
      hopCount: hopCount + 1,
      reply: routed.reply,
      route: routed.route,
      capabilityClass: routed.capabilityClass,
      tool: routed.tool || null,
    };
  } catch (err) {
    const isTimeout = err instanceof FireChainTimeoutError;
    await patchBusProgress(busId, busBody, {
      state: isTimeout ? 'timeout' : 'failed',
      reason: err.message,
      elapsed_ms: Date.now() - turnStartedAt,
    });
    return {
      ...dispatchResult,
      reason: isTimeout
        ? `target turn timed out after ${Date.now() - turnStartedAt}ms (chain budget)`
        : `target turn failed: ${err.message}`,
    };
  }
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
 * @param {object} runCtx - { agentId, ventureId, depth, hopCount, chain, requestId,
 *   chainDeadline } — chainDeadline carries the whole-chain wall-clock budget forward from
 *   whichever fireAgent call started this chain; left unset only for a chain's first hop.
 * @returns {Promise<null|{tool: string, valid: boolean, reason?: string, result?: object}>}
 */
export async function handleToolCall(replyText, runCtx = {}) {
  const call = parseToolCall(replyText);
  if (!call) return null;

  const check = validateToolCall(call);
  if (!check.valid) return { tool: call.tool, valid: false, reason: check.reason };

  if (call.tool === 'done') return { tool: 'done', valid: true };
  if (call.tool === 'ask_operator') return { tool: 'ask_operator', valid: true, message: call.message };

  // fire_agent — depth/hopCount/chain/chainDeadline all carried forward from runCtx so
  // this nested fire is checked by the same checkLoopGuards + budget logic as the root hop.
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
    chainDeadline: runCtx.chainDeadline || null,
  });
  return { tool: 'fire_agent', valid: true, result };
}
