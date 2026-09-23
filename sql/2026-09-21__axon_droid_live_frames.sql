-- BUILD-AXON-DROID-AGENT-0920 (live-screen-streaming slice)
-- One row per computer-use run, upserted by lib/axon-computer-use.mjs after each
-- screenshot so an in-progress run can be observed without waiting for the final
-- Learnings write. Service-role read/write only.
-- Applied live to NI-Brain via mcp__ni-brain__apply_migration on 2026-09-21.

CREATE TABLE IF NOT EXISTS axon_droid_live_frames (
  run_id text PRIMARY KEY,
  task_description text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  step integer NOT NULL DEFAULT 0,
  screenshot_b64 text,
  final_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE axon_droid_live_frames ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE axon_droid_live_frames IS
  'Live-view state for AXON Droid computer-use runs (BUILD-AXON-DROID-AGENT-0920, live-screen-streaming slice) — one row per run_id, upserted by lib/axon-computer-use.mjs after each screenshot so an in-progress session can be observed. Service-role read/write only; RLS enabled with no anon/authenticated policies.';
