-- AXON Portal UX Tracks B/C/D — NI-Brain (kxijunwgbrlfzvgkhklo)
-- Outreach edit signals, user tools registry, global quick links.

-- Track B: operator draft edits for learn loop
CREATE TABLE IF NOT EXISTS public.axon_tool_edit_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_slug text NOT NULL DEFAULT 'ni-outreach',
  resource_type text NOT NULL DEFAULT 'outreach',
  resource_id uuid NOT NULL,
  field_name text NOT NULL,
  before_value text,
  after_value text,
  operator_id text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axon_tool_edit_signals_resource
  ON public.axon_tool_edit_signals (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_axon_tool_edit_signals_tool_created
  ON public.axon_tool_edit_signals (tool_slug, created_at DESC);

COMMENT ON TABLE public.axon_tool_edit_signals IS
  'AXON tool edit diffs for operator learn loop (Outreach HQ draft edits). Service role only.';

ALTER TABLE public.axon_tool_edit_signals ENABLE ROW LEVEL SECURITY;

-- Track C: AXON user tools (Workshop / Create AXON Tool future)
CREATE TABLE IF NOT EXISTS public.axon_user_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  href text NOT NULL,
  icon text NOT NULL DEFAULT '◎',
  source_type text NOT NULL DEFAULT 'custom',
  sort_order int NOT NULL DEFAULT 0,
  operator_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.axon_user_tools IS
  'Per-operator or global AXON tool registry. Service role only.';

ALTER TABLE public.axon_user_tools ENABLE ROW LEVEL SECURITY;

-- Track D: sidebar quick links (max 10 global — enforced in app)
CREATE TABLE IF NOT EXISTS public.axon_quick_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  href text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_global boolean NOT NULL DEFAULT true,
  operator_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axon_quick_links_global_sort
  ON public.axon_quick_links (is_global, sort_order);

COMMENT ON TABLE public.axon_quick_links IS
  'AXON sidebar quick links (max 10 global). Service role only.';

ALTER TABLE public.axon_quick_links ENABLE ROW LEVEL SECURITY;

-- Seed default IT quick links (v0 parity with IT_QUICK_LINKS constant)
INSERT INTO public.axon_quick_links (label, href, sort_order, is_global)
SELECT v.label, v.href, v.sort_order, true
FROM (VALUES
  ('ReplyFlow', 'https://northsideintelligence.com/tools/replyflow', 1),
  ('GrantBot', 'https://northsideintelligence.com/tools/grantbot', 2),
  ('SignalDesk', 'https://northsideintelligence.com/tools/signaldesk', 3),
  ('GapScan', 'https://northsideintelligence.com/tools/gapscan', 4),
  ('BridgeAI', 'https://northsideintelligence.com/tools/bridgeai', 5)
) AS v(label, href, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.axon_quick_links WHERE is_global = true LIMIT 1
);
