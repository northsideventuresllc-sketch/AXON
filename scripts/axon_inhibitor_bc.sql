-- AXON Inhibitor — NI-Brain (kxijunwgbrlfzvgkhklo) — PROPOSED MIGRATION.
-- DO NOT APPLY from a session (Hard Stop). JB approves and applies this.
--
-- HARD CONSTRAINT (Decision #569, JB LOCKED 2026-08-04): AXON NEVER FORGETS.
-- Nothing in this migration adds eviction, TTL, pruning, decay, expiry or an
-- archive tier. It ONLY adds retrieval-side observability + a scale-out index.
-- Every axon_memories row stays permanently at full fidelity.

-- ---------------------------------------------------------------------------
-- 1. Retrieval-gain observability (OPTIONAL, additive).
--    A per-query trace of what SURFACED into working context. This is a
--    diagnostic log of retrieval decisions, NOT a keep/drop verdict on any
--    memory. Rows here never gate a future read — the gain is always
--    recomputed live. Safe to truncate at any time with zero memory loss.
CREATE TABLE IF NOT EXISTS public.axon_retrieval_trace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  channel text,
  task_excerpt text,          -- first ~200 chars of the task, for audit
  candidates int NOT NULL,    -- size of the full pool that competed
  budget int NOT NULL,        -- broadcast budget applied this query
  surfaced jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, gain, phase}]
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.axon_retrieval_trace IS
  'Live retrieval-gain trace: which memories surfaced into working context per query. Diagnostic only — NOT a retention verdict. AXON never forgets; this table can be truncated with no memory loss.';

ALTER TABLE public.axon_retrieval_trace ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_axon_retrieval_trace_operator_time
  ON public.axon_retrieval_trace (operator_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Scale-out: full-text search over memory content (OPTIONAL, additive).
--    Today the wrapper paginates newest-first up to AXON_MEMORY_POOL_MAX.
--    As the permanent store grows, the candidate pool query should become
--    context-driven (still reading ALL matching memories, never hiding any).
--    This index makes that read cheap. It changes NOTHING about retention —
--    it only speeds up which permanent rows are considered per query.
CREATE INDEX IF NOT EXISTS idx_axon_memories_content_fts
  ON public.axon_memories USING gin (to_tsvector('english', content));

-- ---------------------------------------------------------------------------
-- NOTE ON axon_memories.expires_at / superseded_by (already present columns):
--   These exist on the table today. Per Decision #569 the Inhibitor does NOT
--   read, set, or honor expires_at as a retention control. If any process is
--   currently expiring memory by that column, that is the pre-existing
--   contradiction to flag to JB — the Inhibitor deliberately ignores it.
--   No DROP is proposed here (dropping a column is a Hard Stop and a data
--   decision for JB); this note records the boundary for review.
