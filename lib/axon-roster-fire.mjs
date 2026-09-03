/**
 * AXON v0 roster Fire — Phase 2 lane A4 (agentic-os-phase2-harness-usage.md, Phase A4).
 *
 * Lets the AGENTS board's Fleet panel actually fire a `nvg_agent_routines` row instead of
 * only rendering it read-only. Dispatches by `wake_type`, reusing the exact wake logic
 * `slack-agent-router` (nv-vault/supabase/functions/slack-agent-router/index.ts) already
 * runs for `routine_api` / `dispatch_queue` — same target URL, same per-row
 * `fire_token`/`routine_id` fields, same `agent_dispatch` insert shape — so a fire from
 * this dash behaves identically to a Slack `@AGENT` ping. `slack-agent-router` has no
 * generic HTTP "fire" entry point of its own (it only accepts Slack Events API POSTs,
 * signature-verified) so its dispatch logic is reproduced here rather than proxied to it;
 * see the file header there and the PR description for the read that established this.
 *
 * Plain .mjs (same reasoning as axon-agent-bus.mjs / axon-fire-gate-core.mjs): importable
 * from raw `node --test` with no TS loader, and from the Next.js route via the thin
 * `app/api/axon-v0/roster/fire/route.ts` wrapper.
 */
import { createSupabaseClient } from './supabase.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sb() {
  return createSupabaseClient(getSupabaseKey());
}

/**
 * The ONLY shell shape a wake_config.cmds entry may take for an unattended fire from this
 * dash to auto-queue on the Mac mini. Kept in lockstep with the 'node-repo-script' entry
 * in lib/nvg-mini-risk-gate.mjs's ALLOWLISTED_TEMPLATES — same rule, checked twice (once
 * per-command here before a job is ever built, once on the joined string there as
 * defense-in-depth) rather than trusted from one place only.
 */
export const NODE_SCRIPT_CMD_RE = /^node scripts\/[A-Za-z0-9_.\-/]+\.mjs\b/;

/** Same merge/deploy-class heuristic as lib/axon-agent-bus.mjs's fireAgent — duplicated
 *  intentionally rather than exported from there: this route never imports
 *  axon-agent-bus.mjs (lane A4 does not touch that file's neighbor axon-router-core.mjs's
 *  import graph), and the check is two lines. */
const MERGE_DEPLOY_RE = /\bmerge\b|\bdeploy\b|\bpush to (main|prod)\b|\brelease\b/i;

/**
 * PURE decision function — no I/O, so it's cheap and deterministic to unit test (same
 * shape as checkLoopGuards in axon-agent-bus.mjs and scoreLanes in axon-router-core.mjs).
 * Given a `nvg_agent_routines` row, decides HOW it would be fired without firing it.
 *
 * @param {object|null} row - a nvg_agent_routines row (agent_name, retired_at, wake_type,
 *   wake_config, routine_id, fire_token)
 * @returns {{ok: true, route: 'routine_api'|'dispatch_queue'|'mac_mini'|'supabase', cmd?: string, fn?: string}
 *          |{ok: false, reason: string}}
 */
export function decideRosterFireRoute(row) {
  if (!row || typeof row !== 'object' || !row.agent_name) {
    return { ok: false, reason: 'agent not found in the roster (nvg_agent_routines)' };
  }
  if (row.retired_at) {
    return {
      ok: false,
      reason: `"${row.agent_name}" is retired (retired_at set) — reactivate it in nvg_agent_routines before firing it from here`,
    };
  }

  const wakeType = typeof row.wake_type === 'string' ? row.wake_type : '';
  const wakeConfig = row.wake_config && typeof row.wake_config === 'object' ? row.wake_config : {};

  if (wakeType === 'routine_api') {
    if (!row.fire_token || !row.routine_id || String(row.routine_id).startsWith('PENDING')) {
      return {
        ok: false,
        reason: `"${row.agent_name}" has no live API trigger set up yet (missing fire_token or routine_id is still PENDING)`,
      };
    }
    return { ok: true, route: 'routine_api' };
  }

  if (wakeType === 'dispatch_queue') {
    return { ok: true, route: 'dispatch_queue' };
  }

  if (wakeType === 'local_only' || wakeType === 'mac_mini') {
    const rawCmds = Array.isArray(wakeConfig.cmds) ? wakeConfig.cmds : [];
    const cmds = rawCmds.filter((c) => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim());
    if (!cmds.length) {
      return {
        ok: false,
        reason: `"${row.agent_name}" has no runnable command configured (wake_config.cmds is empty) — add one before firing it from here`,
      };
    }
    const bad = cmds.find((c) => !NODE_SCRIPT_CMD_RE.test(c));
    if (bad) {
      return {
        ok: false,
        reason: `"${row.agent_name}"'s command isn't a recognized "node scripts/*.mjs" pattern (${bad.slice(0, 80)}) — firing arbitrary shell from the dash is refused; run it on the mini directly`,
      };
    }
    return { ok: true, route: 'mac_mini', cmd: cmds.join(' && ') };
  }

  if (wakeType === 'supabase') {
    const fn = typeof wakeConfig.fn === 'string' ? wakeConfig.fn : '';
    if (!fn) {
      return {
        ok: false,
        reason: `"${row.agent_name}" has no Supabase function configured (wake_config.fn) to call`,
      };
    }
    return { ok: true, route: 'supabase', fn, args: wakeConfig.args && typeof wakeConfig.args === 'object' ? wakeConfig.args : {} };
  }

  return {
    ok: false,
    reason: `"${wakeType || 'unset'}" isn't a wake type this fire route supports (routine_api, dispatch_queue, mac_mini/local_only, or supabase only)`,
  };
}

async function fireRoutineApi(routineId, fireToken, text) {
  const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${fireToken}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: text.slice(0, 65536) }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function queueDispatchRow(agentName, text) {
  const code = `AXON-V0-FIRE-${agentName.replace(/[^A-Za-z0-9]+/g, '-')}-${Date.now()}`;
  const row = await sb().sbInsert('agent_dispatch', {
    code,
    title: `AXON v0 dash fire: ${text.slice(0, 480)}`,
    owner: agentName,
    status: 'queued',
    action_type: 'manager_phrase',
    executor: 'cloud_session',
    source: 'axon-v0-fire',
    priority: 2,
    needs_jb_approval: false,
  });
  return { ok: true, code, id: row?.id || null };
}

async function queueMiniShellRow(agentName, cmd, note) {
  const row = await sb().sbInsert('nvg_mini_jobs', {
    kind: 'shell',
    title: `AXON v0 dash fire: ${agentName}`.slice(0, 200),
    payload: { cmd, timeout: 120, note: note || null },
    status: 'queued',
    risk_flag: 'low',
    risk_reason: `every command matched the node-repo-script allowlist (axon-v0/roster/fire, ${agentName})`,
  });
  return { ok: true, id: row?.id || null };
}

async function callSupabaseFn(fn, args) {
  try {
    const result = await sb().sbRpc(fn, args || {});
    return { ok: true, result };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Live authority read, same shape as lib/axon-agent-bus.mjs's private lookupAuthority —
 * duplicated (2 lines of logic) rather than exported from that file, for the same reason
 * MERGE_DEPLOY_RE above is duplicated: this module never imports axon-agent-bus.mjs.
 */
async function hasMergeDeployAuthority(agentName, needsDeploy) {
  try {
    const rows = await sb().sbSelect(
      'nvg_agent_authority',
      `agent_name=ilike.${encodeURIComponent(agentName)}&status=eq.active&select=agent_name,can_merge_to_main,can_deploy_to_production,revoked_at&limit=1`,
    );
    const row = rows?.[0];
    if (!row || row.revoked_at) return false;
    return needsDeploy ? !!row.can_deploy_to_production : !!row.can_merge_to_main;
  } catch {
    return false;
  }
}

/**
 * Fire a roster row. Caller (the Next.js route) is responsible for the FIRE/HOLD gate
 * check — this function assumes it has already been cleared, same division of labor as
 * fireAgent() in axon-agent-bus.mjs (its callers check the gate via assertFireAllowed
 * before calling it; the gate check itself lives one layer up so it stays testable
 * without a live NI-Brain row).
 *
 * @param {object} row - a nvg_agent_routines row (from getAgentRoutine, includes fire_token)
 * @param {string} [note] - optional operator note, becomes the task text / agent_bus body
 * @returns {Promise<{ok: true, fired: true, how: string, ref: string|null}
 *          |{ok: false, reason: string, status?: number}>}
 */
export async function fireRosterAgent(row, note) {
  const decision = decideRosterFireRoute(row);
  if (!decision.ok) {
    return { ok: false, reason: decision.reason, status: 422 };
  }

  const text = (note && note.trim()) || `Fired from the AXON v0 roster panel: ${row.agent_name}`;

  if (MERGE_DEPLOY_RE.test(text)) {
    const needsDeploy = /\bdeploy\b|\bpush to prod\b|\brelease\b/i.test(text);
    const ok = await hasMergeDeployAuthority(row.agent_name, needsDeploy);
    if (!ok) {
      return {
        ok: false,
        status: 403,
        reason: `"${row.agent_name}" has no live ${needsDeploy ? 'deploy' : 'merge'} authority (nvg_agent_authority) — refusing a merge/deploy-class fire`,
      };
    }
  }

  let result;
  try {
    if (decision.route === 'routine_api') {
      const fireResult = await fireRoutineApi(row.routine_id, row.fire_token, text);
      result = fireResult.ok
        ? { ok: true, fired: true, how: 'routine_api', ref: row.routine_id }
        : { ok: false, status: 502, reason: `routine API fire failed: HTTP ${fireResult.status}` };
    } else if (decision.route === 'dispatch_queue') {
      const q = await queueDispatchRow(row.agent_name, text);
      result = { ok: true, fired: true, how: 'dispatch_queue', ref: q.code };
    } else if (decision.route === 'mac_mini') {
      const j = await queueMiniShellRow(row.agent_name, decision.cmd, note);
      result = { ok: true, fired: true, how: 'mac_mini', ref: j.id ? String(j.id) : null };
    } else if (decision.route === 'supabase') {
      const r = await callSupabaseFn(decision.fn, decision.args);
      result = r.ok
        ? { ok: true, fired: true, how: 'supabase', ref: decision.fn }
        : { ok: false, status: 502, reason: `Supabase function ${decision.fn} failed: ${r.reason}` };
    } else {
      result = { ok: false, status: 422, reason: 'unreachable: decideRosterFireRoute returned an unknown route' };
    }
  } catch (err) {
    result = { ok: false, status: 502, reason: `fire failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Always write the trace, whether the fire itself succeeded or not — same "make the
  // attempt visible" reasoning as fireAgent()'s agent_bus row.
  try {
    await sb().sbInsert('agent_bus', {
      from_agent: 'AXON-v0-Dash',
      to_agent: row.agent_name,
      subject: text.slice(0, 120),
      body: { note: note || null, decision, result },
      needs_answer: false,
      status: result.ok ? 'answered' : 'open',
    });
  } catch {
    // best-effort trace only — never block the fire's own result on this
  }

  try {
    await sb().sbInsert('agent_task_log', {
      agent_name: row.agent_name,
      task_description: text.slice(0, 2000),
      status: result.ok ? 'in_progress' : 'blocked',
      how_completed: result.ok ? `axon-v0-fire:${result.how}` : null,
    });
  } catch {
    // best-effort — agent_task_log columns can drift; never block the fire result on this
  }

  if (result.ok) {
    try {
      await sb().sbPatch(
        'nvg_agent_routines',
        `agent_name=eq.${encodeURIComponent(row.agent_name)}`,
        { last_fired_at: new Date().toISOString() },
      );
    } catch {
      // best-effort — the fire itself already happened
    }
  }

  return result;
}
