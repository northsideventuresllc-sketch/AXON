/**
 * AX-SUBAGENT-MEMORY-FIELD-0904 fallback — per-persona "NI-Brain slice" memory,
 * read at boot and self-curated by writing back after each task.
 *
 * BACKGROUND: Claude Code's subagent `memory:` frontmatter field (an
 * auto-injected, self-curated MEMORY.md per subagent) was the first approach
 * considered for giving AXON personas persistent memory. Verified NOT
 * buildable in the 2026-09-04 pass on this ticket: anthropics/claude-code
 * bug #57507 (the `tools:` allowlist silently overrides the field's
 * auto-enable, so MEMORY.md is never created/updated even with Write/Edit
 * explicitly granted) is closed "not planned" upstream, with no fix through
 * the CLI version installed here. That pass named this file's approach as
 * the real fallback and left it unbuilt — this closes that gap.
 *
 * APPROACH: store each persona's durable, self-curated memory directly on
 * its own `axon_venture_agents.config` row (jsonb) under a `memory` array —
 * every agent already has a config object carrying `instructions`, so this
 * needs no new table, no DDL, and no JB-only migration Hard Stop. Read into
 * the boot context the same way lib/axon-agent-boot.mjs already surfaces
 * `instructions` and lib/axon-boot-wisdom.mjs surfaces fleet-wide wisdom;
 * write back via appendAgentMemory() after a task so a persona compounds
 * across runs instead of restarting cold every time.
 *
 * Plain .mjs, same reasoning as the rest of this boot layer: has to run
 * under both Next.js/TS and raw `node` (GitHub Actions, no TS loader).
 */
import { createSupabaseClient } from './supabase.mjs';

export const AGENT_MEMORY_TABLE = 'axon_venture_agents';
export const DEFAULT_MAX_MEMORY_ENTRIES = 20;
export const MAX_MEMORY_NOTE_CHARS = 240;
export const MAX_MEMORY_BLOCK_CHARS = 800;

function clip(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/**
 * Format an agent's own memory entries into a capped, labelled prompt block.
 * Mirrors formatBootWisdomBlock's shape in lib/axon-boot-wisdom.mjs: no rows
 * in -> no block out, never an empty labelled header.
 * @param {Array<{note?: string, at?: string}>} entries
 */
export function formatAgentMemoryBlock(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const header = 'Your memory (self-curated, most recent last):';
  const lines = [header];
  for (const entry of entries) {
    const note = clip(entry?.note, 200);
    if (!note) continue;
    const when = entry?.at ? String(entry.at).slice(0, 10) : '';
    const line = `- ${when ? `[${when}] ` : ''}${note}`;
    const candidate = [...lines, line].join('\n');
    if (candidate.length > MAX_MEMORY_BLOCK_CHARS) break;
    lines.push(line);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Append a self-curated memory note to this agent's own config.memory array.
 *
 * config is jsonb and PATCH replaces the whole column, so this is a
 * read-modify-write: the current config is read first and only the `memory`
 * key is touched — every other key round-trips unchanged. Caps to
 * maxEntries (oldest dropped first) so this can never grow unbounded.
 *
 * Never throws — a failed read or write degrades to { ok: false, reason },
 * the same fail-open-on-read posture safeSelect() uses in
 * lib/axon-agent-boot.mjs.
 *
 * @param {{
 *   agentId: string,
 *   note: string,
 *   supabaseKey?: string,
 *   maxEntries?: number,
 *   now?: () => string,
 *   client?: { sbSelect: Function, sbPatch: Function },
 * }} opts
 * @returns {Promise<{ ok: boolean, count: number, reason?: string }>}
 */
export async function appendAgentMemory(opts = {}) {
  const {
    agentId,
    note,
    supabaseKey = getSupabaseKey(),
    maxEntries = DEFAULT_MAX_MEMORY_ENTRIES,
    now = () => new Date().toISOString(),
    client,
  } = opts;

  const cleanNote = clip(note, MAX_MEMORY_NOTE_CHARS);
  if (!agentId || !cleanNote) {
    return { ok: false, count: 0, reason: 'missing agentId or note' };
  }
  if (!client && !supabaseKey) {
    return { ok: false, count: 0, reason: 'no supabase key configured' };
  }

  const sb = client || createSupabaseClient(supabaseKey);

  let currentConfig = {};
  try {
    const rows = await sb.sbSelect(AGENT_MEMORY_TABLE, `id=eq.${agentId}&select=config&limit=1`);
    if (!rows?.length) {
      return { ok: false, count: 0, reason: `no ${AGENT_MEMORY_TABLE} row for ${agentId}` };
    }
    currentConfig = rows[0]?.config || {};
  } catch {
    return { ok: false, count: 0, reason: 'read failed' };
  }

  const existing = Array.isArray(currentConfig.memory) ? currentConfig.memory : [];
  const nextMemory = [...existing, { note: cleanNote, at: now() }].slice(-maxEntries);
  const nextConfig = { ...currentConfig, memory: nextMemory };

  try {
    await sb.sbPatch(AGENT_MEMORY_TABLE, `id=eq.${agentId}`, { config: nextConfig });
  } catch {
    return { ok: false, count: nextMemory.length, reason: 'write failed' };
  }

  return { ok: true, count: nextMemory.length };
}
