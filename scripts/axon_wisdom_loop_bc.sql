-- AX-WISDOM-LOOP — Watch→digest→enhance wisdom absorb (NI-Brain kxijunwgbrlfzvgkhklo)

CREATE TABLE IF NOT EXISTS public.axon_wisdom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  fingerprint text NOT NULL,
  title text NOT NULL,
  principle text NOT NULL,
  application text,
  domain text NOT NULL DEFAULT 'general',
  source_type text NOT NULL,
  source_ref text,
  confidence text NOT NULL DEFAULT 'provisional',
  salience numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'absorbed',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  absorbed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_axon_wisdom_items_salience
  ON public.axon_wisdom_items (operator_id, salience DESC, absorbed_at DESC);

CREATE INDEX IF NOT EXISTS idx_axon_wisdom_items_domain
  ON public.axon_wisdom_items (domain, status);

COMMENT ON TABLE public.axon_wisdom_items IS
  'AX-WISDOM-LOOP absorbed wisdom units from ND corpus, research, Learnings, and signals. Service role only.';

ALTER TABLE public.axon_wisdom_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.axon_wisdom_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL DEFAULT 'default',
  day_key text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'heuristic',
  watched_count int NOT NULL DEFAULT 0,
  digested_count int NOT NULL DEFAULT 0,
  enhanced_count int NOT NULL DEFAULT 0,
  absorbed_count int NOT NULL DEFAULT 0,
  summary text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axon_wisdom_runs_created
  ON public.axon_wisdom_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_axon_wisdom_runs_day
  ON public.axon_wisdom_runs (operator_id, day_key DESC);

COMMENT ON TABLE public.axon_wisdom_runs IS
  'AX-WISDOM-LOOP run audit: watch→digest→enhance→absorb. Service role only.';

ALTER TABLE public.axon_wisdom_runs ENABLE ROW LEVEL SECURITY;
