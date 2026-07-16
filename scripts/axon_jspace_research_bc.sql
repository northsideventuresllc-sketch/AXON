-- AXON J-Space + Autonomous Research — NI-Brain (kxijunwgbrlfzvgkhklo)
-- Global workspace analogue + self-learning research findings.

-- J-space state: verbalizable concept workspace (limited capacity broadcast hub)
CREATE TABLE IF NOT EXISTS public.axon_jspace_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  active_concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  broadcast_queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  gap_backlog jsonb NOT NULL DEFAULT '[]'::jsonb,
  implementation_queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id)
);

CREATE INDEX IF NOT EXISTS idx_axon_jspace_state_operator
  ON public.axon_jspace_state (operator_id);

COMMENT ON TABLE public.axon_jspace_state IS
  'AXON J-space analogue: limited-capacity verbalizable workspace for broadcast reasoning. Service role only.';

ALTER TABLE public.axon_jspace_state ENABLE ROW LEVEL SECURITY;

-- Autonomous research findings (AI models, OSS repos, neuroscience)
CREATE TABLE IF NOT EXISTS public.axon_research_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  research_lane text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  implementation_hint text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  jspace_relevance text,
  brain_gap_category text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axon_research_findings_created
  ON public.axon_research_findings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_axon_research_findings_lane_status
  ON public.axon_research_findings (research_lane, status, created_at DESC);

COMMENT ON TABLE public.axon_research_findings IS
  'AXON autonomous research: AI models, OSS repos, neuroscience gaps. Feeds daily briefs. Service role only.';

ALTER TABLE public.axon_research_findings ENABLE ROW LEVEL SECURITY;

-- Research run lab log (audit + weekly rate limiting) — AX-RESEARCH-RUNS
CREATE TABLE IF NOT EXISTS public.axon_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  lane text NOT NULL,
  findings_count int NOT NULL DEFAULT 0,
  briefing_items_added int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  summary text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent upgrade for DBs created before summary column
ALTER TABLE public.axon_research_runs
  ADD COLUMN IF NOT EXISTS summary text;

CREATE INDEX IF NOT EXISTS idx_axon_research_runs_created
  ON public.axon_research_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_axon_research_runs_status_created
  ON public.axon_research_runs (status, created_at DESC);

COMMENT ON TABLE public.axon_research_runs IS
  'AXON self-research lab log (completed|failed|skipped). Service role only. Job: AX-RESEARCH-RUNS.';

ALTER TABLE public.axon_research_runs ENABLE ROW LEVEL SECURITY;
