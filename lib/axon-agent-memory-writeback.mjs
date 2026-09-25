/**
 * AX-SUBAGENT-MEMORY-FIELD-0904 — named fallback (NI-Brain slice per persona, read at
 * boot), the part of this ticket that was explicitly NOT attempted yet.
 *
 * The `memory:` Claude Code subagent frontmatter route this ticket originally asked for
 * is closed not-planned (bug #57507) — that mechanism does not exist to build against.
 * lib/axon-agent-boot.mjs already reads a per-persona slice at boot
 * (axon_venture_agents.config->>'instructions', all 46 personas already have one), but
 * nothing ever wrote a correction back into that slice after a task ran — only the read
 * half of "subagents compound instead of restarting" existed.
 *
 * recordAgentMemory() closes the write half: merge one capped, deduped,
 * supersede-in-place note into axon_venture_agents.config.memory_notes. The next boot's
 * buildAgentBootContext() (lib/axon-agent-boot.mjs) surfaces the persisted slice through
 * formatAgentMemoryBlock(), in its own token budget, the same way axon-boot-wisdom.mjs's
 * block is appended — so a persona's memory can never crowd out its base
 * instructions/authority/rules.
 *
 * Deterministic truncate/cap/dedup only, no LLM call for curation — same reasoning as
 * axon-boot-wisdom.mjs. Reuses the existing Supabase project and the existing sb()
 * wrapper (lib/supabase.mjs) already used by axon-agent-boot.mjs / axon-agent-bus.mjs —
 * no new infra, no new dependency, free-tier only (MONEY: free tiers first).
 */
import { createHash } from 'node:crypto';
import { createSupabaseClient } from './supabase.mjs';

export const AGENT_MEMORY_TABLE = 'axon_venture_agents';
/** Hard cap on how many notes a persona's memory slice can hold at once. */
export const MAX_MEMORY_NOTES = 8;
/** Hard cap on the serialized memory_notes JSON and on the rendered prompt block. */
export const MAX_MEMORY_NOTES_CHARS = 1200;
/** Per-note clip so one long note can never dominate the block on its own. */
export const MAX_NOTE_CHARS = 240;

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function clip(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

/**
 * Stable fingerprint for supersede-in-place dedup — the same topic (falling back to
 * source, when no explicit topic is given) always replaces its prior entry instead of
 * accumulating a duplicate, matching brain-row-hygiene's "supersede, never two live rows
 * arguing" rule applied to a persona's own memory slice.
 */
export function memoryFingerprint(topicOrSource) {
  const raw = String(topicOrSource || '').trim().toLowerCase();
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

/**
 * Merge one new note into an existing memory_notes array: any row sharing the incoming
 * note's fingerprint is superseded in place (removed, then the new entry takes the front
 * slot) rather than appended alongside it, so repeated corrections on the same
 * topic/source never pile up as duplicates. Newest-first. Hard-capped by entry count
 * (MAX_MEMORY_NOTES) and then by total serialized char budget
 * (MAX_MEMORY_NOTES_CHARS) — the just-recorded entry is never the one dropped, since a
 * single clipped note is always far under the block budget on its own.
 * @param {Array<object>} existing
 * @param {{note:string, source:string, taskRef?:string|null, topic?:string}} incoming
 * @returns {Array<object>}
 */
export function mergeMemoryNotes(existing = [], incoming) {
  const fingerprint = memoryFingerprint(incoming?.topic || incoming?.source);
  const entry = {
    fingerprint,
    note: clip(incoming?.note, MAX_NOTE_CHARS),
    source: incoming?.source || 'unknown',
    task_ref: incoming?.taskRef || null,
    recorded_at: new Date().toISOString(),
  };

  const survivors = (Array.isArray(existing) ? existing : []).filter(
    (row) => row?.fingerprint !== fingerprint,
  );
  let merged = [entry, ...survivors].slice(0, MAX_MEMORY_NOTES);

  while (merged.length > 1 && JSON.stringify(merged).length > MAX_MEMORY_NOTES_CHARS) {
    merged = merged.slice(0, -1);
  }
  return merged;
}

/**
 * Format a persona's persisted memory notes into a capped, labelled prompt block — same
 * shape/contract as axon-boot-wisdom.mjs's formatBootWisdomBlock: empty input never
 * produces an empty labelled header, and the block never exceeds its own char budget.
 * @param {Array<object>} notes
 */
export function formatAgentMemoryBlock(notes = []) {
  if (!Array.isArray(notes) || !notes.length) return '';
  const header = 'Recent self-corrections (this agent, persisted across runs):';
  const lines = [header];
  for (const row of notes) {
    const line = `- [${row?.source || 'unknown'}] ${clip(row?.note, MAX_NOTE_CHARS)}`;
    const candidate = [...lines, line].join('\n');
    if (candidate.length > MAX_MEMORY_NOTES_CHARS) break;
    lines.push(line);
  }
  return lines.join('\n');
}

async function loadAgentConfig(client, agentId) {
  const rows = await client.sbSelect(AGENT_MEMORY_TABLE, `id=eq.${agentId}&select=id,config&limit=1`);
  return rows?.[0] || null;
}

/**
 * Record a self-correction / learning note against one persona's own NI-Brain slice.
 * Never throws — a missing key, an unknown agent, or a Supabase/network failure all
 * degrade to {ok:false, reason}, the same fail-safe posture as every read in this
 * module's sibling boot files (lib/axon-agent-boot.mjs, lib/axon-boot-wisdom.mjs).
 *
 * @param {string} agentId - axon_venture_agents.id
 * @param {{note:string, source:string, taskRef?:string|null, topic?:string}} entry
 * @param {{supabaseKey?:string, client?:{sbSelect:Function, sbPatch:Function}}} [opts]
 *   `client` lets a caller (or a test) inject a stub in place of the real Supabase
 *   wrapper without needing a live key.
 * @returns {Promise<{ok:boolean, reason?:string, notes?:Array<object>}>}
 */
export async function recordAgentMemory(agentId, entry, opts = {}) {
  if (!agentId) return { ok: false, reason: 'no agentId' };
  if (!entry || typeof entry.note !== 'string' || !entry.note.trim()) {
    return { ok: false, reason: 'no note text given' };
  }

  const supabaseKey = opts.supabaseKey || getSupabaseKey();
  if (!opts.client && !supabaseKey) {
    return { ok: false, reason: 'no supabase key configured' };
  }
  const client = opts.client || createSupabaseClient(supabaseKey);

  let agent;
  try {
    agent = await loadAgentConfig(client, agentId);
  } catch (err) {
    return { ok: false, reason: `read failed: ${err.message}` };
  }
  if (!agent) return { ok: false, reason: `no ${AGENT_MEMORY_TABLE} row for ${agentId}` };

  const existingNotes = Array.isArray(agent.config?.memory_notes) ? agent.config.memory_notes : [];
  const mergedNotes = mergeMemoryNotes(existingNotes, {
    note: entry.note,
    source: entry.source || 'unknown',
    taskRef: entry.taskRef ?? null,
    topic: entry.topic,
  });

  const nextConfig = { ...(agent.config || {}), memory_notes: mergedNotes };
  try {
    await client.sbPatch(AGENT_MEMORY_TABLE, `id=eq.${agentId}`, { config: nextConfig });
  } catch (err) {
    return { ok: false, reason: `write failed: ${err.message}` };
  }
  return { ok: true, notes: mergedNotes };
}
