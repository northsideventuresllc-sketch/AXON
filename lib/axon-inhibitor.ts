/**
 * AXON Inhibitor — TS wrapper. Gated memory retrieval for working context.
 *
 * AXON NEVER FORGETS (Decision #569): this wrapper reads the FULL candidate
 * pool and gates only what SURFACES. It never deletes, expires, downgrades
 * or persists any verdict about a memory.
 *
 * memory_tier (free_chat vs pro) is a billing boundary, not architecture —
 * this module does not touch it.
 */
import type { AxonMemory } from './axon-types';
// @ts-ignore - mjs module
import {
  MEMORY_BROADCAST_BUDGET,
  selectMemoriesForContext,
} from './axon-inhibitor-core.mjs';

const OPERATOR_ID = 'default';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export interface RetrievalContext {
  /** The operator's current message / task text. */
  taskText?: string;
  /** Recent conversation turns, concatenated. */
  recentTurnsText?: string;
  channel?: 'chat' | 'voice' | 'briefing' | 'outreach' | 'research' | 'execution';
}

export interface GatedMemories {
  memories: AxonMemory[];
  trace: { id: string; gain: number; phase: 'gain' | 'foreign' }[];
  candidates: number;
  budget: number;
}

/**
 * Fetch the full memory pool for the operator and gate it live.
 *
 * Candidate pool cap is a wide safety valve for request size (default 500,
 * newest-first pagination), NOT a retention policy — raise
 * AXON_MEMORY_POOL_MAX as the store grows, and see the proposed FTS index in
 * scripts/axon_inhibitor_bc.sql for the scale-out path where the pool query
 * itself becomes context-driven instead of paginated.
 */
export async function fetchMemoriesGated(
  context: RetrievalContext,
  operatorId: string = OPERATOR_ID,
  budget: number = MEMORY_BROADCAST_BUDGET
): Promise<GatedMemories> {
  const key = getSupabaseKey();
  const poolMax = Number(process.env.AXON_MEMORY_POOL_MAX || 500);
  const base = 'https://kxijunwgbrlfzvgkhklo.supabase.co/rest/v1';
  const r = await fetch(
    `${base}/axon_memories?operator_id=eq.${encodeURIComponent(
      operatorId
    )}&select=*&order=created_at.desc&limit=${poolMax}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    }
  );
  if (!r.ok) throw new Error(`axon_memories pool read: HTTP ${r.status}`);
  const pool = ((await r.json()) as AxonMemory[]) || [];

  return selectMemoriesForContext(pool, context, { budget }) as GatedMemories;
}
