/**
 * AXON Agent Boot — problem #7 fix: agents were starting from nothing instead of
 * the two brains (NI-Brain + this agent's own record).
 *
 * buildAgentBootContext(agentId) reads, live, every time:
 *   1. the agent's own `instructions` (axon_venture_agents.config->>'instructions' —
 *      all 46 agents already have one written; this reads it, never regenerates it)
 *   2. the active golden skills (`golden_skills where status='active'` — the live
 *      list and count, never a hardcoded copy — golden skills change over time)
 *   3. the live rules row (`v_boot`) — rules version/hash, FIRE/HOLD switches
 *   4. the agent's own authority row (`nvg_agent_authority`, matched by name; fails
 *      closed to "no authority" the same way lib/axon-agent-bus.mjs does)
 *   5. its previous run (`session_notes_apartment`, filtered to this agent)
 *   6. BPA-C2-BRAIN-GAPS-0906(b): consolidated wisdom (`lib/axon-boot-wisdom.mjs`'s
 *      loadBootWisdom — the highest-salience rows already absorbed by
 *      lib/wisdom-absorb-loop.mjs's enhanceFromWisdom, read fresh at boot instead
 *      of starting cold). On by default; AXON_BOOT_WISDOM=0 turns it off. Capped
 *      and appended separately from the rest of the block below (own budget) so
 *      it can never crowd out instructions/authority/rules when both are present.
 *
 * Kept token-lean on purpose (JB is paying for these tokens): every section is
 * summarised and the whole block is hard-capped, never a raw table dump.
 *
 * Plain .mjs, same reasoning as axon-router-core.mjs / axon-agent-bus.mjs: has to
 * run under both Next.js/TS and raw `node` (GitHub Actions, no TS loader).
 */
import { createSupabaseClient } from './supabase.mjs';
import { loadBootWisdom } from './axon-boot-wisdom.mjs';

const MAX_BOOT_CONTEXT_CHARS = 2200;
const MAX_INSTRUCTIONS_CHARS = 900;
const MAX_PREVIOUS_RUN_CHARS = 260;

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sb() {
  return createSupabaseClient(getSupabaseKey());
}

async function safeSelect(table, filter) {
  try {
    return await sb().sbSelect(table, filter);
  } catch {
    return [];
  }
}

async function loadAgent(agentId) {
  const rows = await safeSelect(
    'axon_venture_agents',
    `id=eq.${agentId}&select=id,name,role,venture_id,config&limit=1`,
  );
  return rows?.[0] || null;
}

async function loadGoldenSkills() {
  const rows = await safeSelect('golden_skills', `status=eq.active&select=skill_name&order=skill_name.asc`);
  return rows.map((r) => r.skill_name).filter(Boolean);
}

async function loadBootRow() {
  const rows = await safeSelect('v_boot', 'select=rules,switches,health,booted_at&limit=1');
  return rows?.[0] || null;
}

/** Fails closed: no matching active row means no authority, never "assume yes". */
async function loadAuthority(agentName) {
  if (!agentName) return { found: false, can_merge_to_main: false, can_deploy_to_production: false };
  const rows = await safeSelect(
    'nvg_agent_authority',
    `agent_name=ilike.${encodeURIComponent(agentName)}&status=eq.active&select=can_merge_to_main,can_deploy_to_production,revoked_at&limit=1`,
  );
  const row = rows?.[0];
  if (!row || row.revoked_at) return { found: false, can_merge_to_main: false, can_deploy_to_production: false };
  return { found: true, can_merge_to_main: !!row.can_merge_to_main, can_deploy_to_production: !!row.can_deploy_to_production };
}

/**
 * session_notes_apartment has no agent-id column, so "filtered to this agent" is a
 * best-effort ILIKE over raw_note for the agent's id or name — the note text is
 * where an agent's own name/id shows up when it wrote about its own run.
 */
async function loadPreviousRun(agentId, agentName) {
  const needle = agentName || agentId;
  if (!needle) return null;
  const rows = await safeSelect(
    'session_notes_apartment',
    `raw_note=ilike.*${encodeURIComponent(needle)}*&order=created_at.desc&select=raw_note,created_at&limit=1`,
  );
  return rows?.[0] || null;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * @param {string} agentId - axon_venture_agents.id
 * @returns {Promise<{systemPrompt: string, meta: object}>}
 */
export async function buildAgentBootContext(agentId) {
  if (!agentId) {
    return { systemPrompt: '', meta: { skipped: 'no agentId' } };
  }
  const key = getSupabaseKey();
  if (!key) {
    return { systemPrompt: '', meta: { skipped: 'no supabase key configured' } };
  }

  const agent = await loadAgent(agentId);
  if (!agent) {
    return { systemPrompt: '', meta: { skipped: `no axon_venture_agents row for ${agentId}` } };
  }

  const [skills, boot, authority, previousRun, bootWisdom] = await Promise.all([
    loadGoldenSkills(),
    loadBootRow(),
    loadAuthority(agent.name),
    loadPreviousRun(agentId, agent.name),
    loadBootWisdom({ supabaseKey: key }),
  ]);

  const instructions = truncate(agent.config?.instructions || '', MAX_INSTRUCTIONS_CHARS);
  const rulesVersion = boot?.rules?.version || boot?.rules?.hash || null;
  const fireMode = boot?.switches?.fire_mode || boot?.switches?.AXON_FIRE_MODE || null;
  const healthNote = boot?.health?.summary || boot?.health?.status || null;

  const lines = [
    `You are "${agent.name}" (role: ${agent.role}).`,
    instructions ? `Your instructions: ${instructions}` : null,
    `Active golden skills (${skills.length}): ${skills.length ? skills.join(', ') : 'none live'}`,
    rulesVersion ? `Live rules version: ${rulesVersion}.` : 'Live rules row unavailable this boot.',
    fireMode ? `FIRE/HOLD gate: ${fireMode}.` : null,
    healthNote ? `System health: ${healthNote}.` : null,
    authority.found
      ? `Your authority: merge=${authority.can_merge_to_main}, deploy=${authority.can_deploy_to_production}.`
      : 'Your authority: none on file — treat merge/deploy as refused.',
    previousRun
      ? `Your last logged run (${previousRun.created_at}): ${truncate(previousRun.raw_note, MAX_PREVIOUS_RUN_CHARS)}`
      : 'No previous run found in session_notes_apartment.',
  ].filter(Boolean);

  const baseSystemPrompt = truncate(lines.join('\n'), MAX_BOOT_CONTEXT_CHARS);
  // Own budget (loadBootWisdom self-caps at MAX_BOOT_WISDOM_BLOCK_CHARS) — appended
  // after the base block's own truncate so wisdom never eats into the instructions/
  // rules/authority section above, and is itself absent entirely when disabled or empty.
  const systemPrompt = bootWisdom.block ? `${baseSystemPrompt}\n\n${bootWisdom.block}` : baseSystemPrompt;

  return {
    systemPrompt,
    meta: {
      agentId,
      agentName: agent.name,
      role: agent.role,
      ventureId: agent.venture_id,
      goldenSkillCount: skills.length,
      rulesVersion,
      fireMode,
      authority,
      hasPreviousRun: !!previousRun,
      bootWisdomEnabled: bootWisdom.enabled,
      bootWisdomCount: bootWisdom.count,
    },
  };
}
