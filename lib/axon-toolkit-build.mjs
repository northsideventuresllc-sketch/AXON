/**
 * AXON Toolkit Build — usability item #10.
 *
 * SPEC (read live before writing this, not guessed): NI-Brain Decisions #1570 and
 * session_notes_apartment #296 (2026-08-30) list #10 only as "toolkit build agent," last
 * and least-detailed of the 11 items — no further wording is on record. The concrete gap
 * it closes is the one flagged in code, not in a decision row: the Toolkit's "Create
 * custom widget" flow (components/axon-v0/custom-widget-maker.tsx) drafts a spec with a
 * client-only heuristic and calls it "created," but the spec never reaches any agent or
 * any table — it just sits in localStorage forever wearing a "Draft" badge
 * (components/axon-v0/widget-catalog.tsx's CustomWidgetCard, and its own comment: "spec
 * only — not yet provisioned. Live provisioning comes next.").
 *
 * SCOPE, STATED HONESTLY: this does not do runtime codegen — turning a spec into a new,
 * live, rendering widget component is still a later build, exactly as the existing
 * draftFromPrompt() stub in app/api/axon-v0/tools/route.ts already says ("runtime codegen
 * is a later build") for the sibling Tool Maker flow. What this closes is the smaller,
 * real gap: the spec no longer dead-ends in the browser. It is hand-delivered to the
 * venture's own Build Manager agent — role `build_manager`, seeded on every venture via
 * DEFAULT_AGENTS in lib/axon-v0/types.ts ("Owns everything being built ... take one-off
 * builds straight to it") — through the SAME fireAgent() path problem #4 built
 * (lib/axon-agent-bus.mjs): same loop guards, same wall-clock budget, same
 * axon_agent_messages + agent_bus trail as any other agent hand-off. Nothing here
 * reimplements fireAgent or its guards; nothing here bypasses them.
 *
 * GATE: a build agent that can create things is exactly what FIRE/HOLD exists to hold.
 * "build a widget" does not match any of fireAgent's own classifyGatedAction() keyword
 * regexes (those are outreach/dispatch/cron/publish/reddit), so a widget build would
 * slip through fireAgent's internal gate check ungated. This module re-checks the gate
 * explicitly, under its own action id (`toolkit.build`), BEFORE calling fireAgent at all
 * — belt and suspenders, never a workaround.
 */
import { assertFireAllowed, FireHoldError } from './axon-fire-gate-core.mjs';
import { fireAgent } from './axon-agent-bus.mjs';

export { FireHoldError };

export const TOOLKIT_BUILD_GATE_ACTION = 'toolkit.build';

/**
 * Pure, synchronous, no I/O — the task text handed to the Build Manager. Exported on its
 * own so it is cheap and deterministic to unit test, same reasoning as buildToolkitTask's
 * siblings (scoreLanes, checkLoopGuards) elsewhere in this codebase.
 *
 * @param {{ name?: string, summary?: string, icon?: string, fields?: string[] }} spec
 * @returns {string}
 */
export function buildToolkitTask(spec) {
  const name = String(spec?.name || '').trim() || 'Untitled widget';
  const summary = String(spec?.summary || '').trim();
  const fields = Array.isArray(spec?.fields) ? spec.fields.filter((f) => typeof f === 'string' && f.trim()) : [];

  const lines = [
    `A Toolkit user drafted a custom widget called "${name}" and asked to build it.`,
    summary ? `What it should show: ${summary}` : null,
    fields.length ? `Drafted fields:\n${fields.map((f) => `- ${f.trim()}`).join('\n')}` : null,
    'Reply with what you need to actually provision this (a data source, an existing API route it can read, or a short plan) — do not fabricate that it is already live. Respect the FIRE/HOLD gate for anything that would send or publish.',
  ].filter(Boolean);

  return lines.join('\n\n');
}

/**
 * Hands a drafted Toolkit spec to the given Build Manager agent. The caller resolves
 * `toAgentId` itself (via the existing lib/axon-v0/store.ts listAgents() reader, filtered
 * to role `build_manager` for the target venture) — this function does not run a second,
 * parallel agent lookup; it only gates and dispatches.
 *
 * @param {object} p
 * @param {{ name?: string, summary?: string, icon?: string, fields?: string[] }} p.spec
 * @param {string} p.toAgentId - the resolved Build Manager's axon_venture_agents.id
 * @param {string|null} [p.ventureId]
 * @param {string} [p.fromAgentId] - defaults to a synthetic UI sender, not a real agent id
 * @returns {Promise<{ok: boolean, held?: boolean, reason?: string, busId?: string|null,
 *   agentId?: string|null, state?: 'dispatched'|'completed', reply?: string|null}>}
 */
export async function requestToolkitBuild({ spec, toAgentId, ventureId = null, fromAgentId = 'toolkit-ui' }) {
  if (!spec || !String(spec.name || '').trim()) {
    return { ok: false, reason: 'no widget spec given' };
  }
  if (!toAgentId || typeof toAgentId !== 'string') {
    return { ok: false, reason: 'no Build Manager to hand this to' };
  }

  try {
    await assertFireAllowed(TOOLKIT_BUILD_GATE_ACTION);
  } catch (err) {
    if (err instanceof FireHoldError) {
      return { ok: false, held: true, reason: err.message };
    }
    throw err;
  }

  const task = buildToolkitTask(spec);
  const result = await fireAgent({
    fromAgentId,
    toAgentId,
    ventureId,
    task,
    context: JSON.stringify({ toolkitSpec: spec }),
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason || 'Build Manager refused this' };
  }

  return {
    ok: true,
    busId: result.busId || null,
    agentId: toAgentId,
    state: result.resolved ? 'completed' : 'dispatched',
    reply: result.reply || null,
  };
}
