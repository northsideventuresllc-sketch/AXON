/**
 * NVG RESOLUTION SWEEP — hook 2 of 3 for ticket BUILD-MECHANICAL-TICKETS-FIRST-HOOKS-0907.
 * Canonical copy: nv-vault/.claude/hooks/nvg-resolution-sweep.mjs (locked-rule-sync: edit
 * here, copy everywhere). Invoked from nvg-close.mjs at the end of a close-out, never as
 * its own hook.
 *
 * WHY THIS EXISTS (Decision #1822, EXEC stale-board root cause, 2026-09-07): resolved
 * items resurface because fixing a ticket does not close its sibling bus/rolling-task
 * rows, so stale-but-answered rows keep getting rendered as if still open.
 *
 * DELIBERATE SCOPE DECISION: this does NOT do fuzzy/keyword auto-matching of "which open
 * rows look related" — an automatic matcher that guesses wrong silently closes real open
 * work, which is worse than the stale-board problem it replaces. Instead it makes the
 * thing operator-core already asks for MECHANICAL: the closing agent explicitly lists the
 * sibling ticket ids it just resolved as a side effect of this fix (`resolved_siblings` in
 * the close-out JSON), and this module is the one place that turns that list into an
 * actual agent_bus write — so "I fixed X, which also answers Y and Z" stops being a
 * mental note the agent forgets to act on and becomes one mechanical, auditable step.
 * `resolved_siblings` is OPTIONAL on the close-out schema (empty array is valid) so this
 * does not break sessions running an older close-out prompt.
 */

// A sibling id must be a plain integer or a UUID — never spliced raw into a PostgREST
// filter string. Without this, an LLM-authored `resolved_siblings[].id` (read from a
// ticket body the agent may not fully control) could smuggle extra query params into
// the PATCH filter, e.g. id="1&status=neq.superseded", widening which rows get touched.
const ID_RE = /^[0-9]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure: build the PATCH body for one sibling row. No network, no Date.now() (caller
 * supplies `nowIso` so this stays deterministic and testable).
 */
export function buildSupersedePatch(entry, { closeoutTask, agent, nowIso }) {
  if (!entry || !entry.id) throw new Error('resolved_siblings entry needs an id');
  if (!ID_RE.test(String(entry.id))) throw new Error(`resolved_siblings entry id is not a valid row id: ${JSON.stringify(entry.id)}`);
  const reason = entry.reason || 'resolved as a side effect of a related fix';
  return {
    status: 'superseded',
    superseded_note: `[RESOLUTION-SWEEP] closed by ${agent} at ${nowIso} as a sibling of "${closeoutTask}" — ${reason}`,
  };
}

/**
 * Apply the sweep: PATCH every listed sibling to superseded via the injected `patchRow`
 * (same shape as scripts/lib/hermes-supabase.mjs sbPatch). Never throws — a failure to
 * close one sibling must not fail the close-out itself; each result is reported instead.
 */
export async function sweepSiblings(entries, { agent, closeoutTask, nowIso, patchRow }) {
  const list = Array.isArray(entries) ? entries : [];
  const results = [];
  for (const entry of list) {
    try {
      const patch = buildSupersedePatch(entry, { closeoutTask, agent, nowIso });
      const filter = `id=eq.${encodeURIComponent(String(entry.id))}`;
      await patchRow('agent_bus', filter, patch);
      results.push({ id: entry.id, ok: true });
    } catch (e) {
      results.push({ id: entry.id, ok: false, error: e.message });
    }
  }
  return results;
}
