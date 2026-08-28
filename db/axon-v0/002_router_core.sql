-- AXON v0 — Omni Router core.
--
-- WHY THIS FILE EXISTS: router_routes / router_models / router_health were created
-- directly in NI-Brain and live NOWHERE in source control (grep the repo — zero hits).
-- This migration brings them under version control for the first time and adds the
-- connector + capability model the v0 harness needs.
--
-- APPLY ORDER: 001 first, then 002. 001's axon_agent_model_assignments.lane_id references
-- router_models(id), which already exists in the live DB. On a genuinely fresh database,
-- run the "router tables" section below before 001.
--
-- Everything here is idempotent (create/add ... if not exists, upsert seeds) so this file
-- can be re-applied safely.

-- ---------------------------------------------------------------------------
-- 1. Router tables — documented at their current live shape.
-- ---------------------------------------------------------------------------

create table if not exists router_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'api',   -- subprocess | api | local (existing check constraint)
  secret_key text references ni_platform_secrets(key),                    -- NAME of a key in ni_platform_secrets, never a value
  base_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists router_models (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id),
  model text not null,
  tier_rank int not null default 3,
  priority int not null default 10,
  enabled boolean not null default true
);

create table if not exists router_health (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id),
  model text,
  status text not null default 'healthy',   -- healthy | degraded | circuit_open
  reason text,
  failure_count int not null default 0,
  backoff_seconds int not null default 0,
  retry_after timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Postgres has no ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS. Guard it, or the whole
-- apply aborts on a re-run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'router_routes_name_key') then
    alter table router_routes add constraint router_routes_name_key unique (name);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Connector kind — a subscription lane is a CLI on an operator machine, not an API.
-- ---------------------------------------------------------------------------

alter table router_routes add column if not exists connector_kind text not null default 'api';
  -- 'api' | 'subscription' | 'local'
alter table router_routes add column if not exists cli_command text;
  -- 'claude' | 'codex' | 'gemini' — only set when connector_kind = 'subscription'
alter table router_routes add column if not exists auth_scope text;
  -- human note on what is authenticated, e.g. 'Claude Max, signed in on the Mac mini'
alter table router_routes add column if not exists requires_mini boolean not null default false;
alter table router_routes add column if not exists account_id uuid;
  -- null = global catalog row; set = an account's own custom connector

-- ---------------------------------------------------------------------------
-- 3. Capability metadata — auto mode reads this, never a hardcoded map in code.
-- ---------------------------------------------------------------------------

alter table router_models add column if not exists capabilities text[] not null default '{}';
  -- cheap_chat | long_context | code_build | reasoning_planning | vision
  -- | tool_use_agentic | computer_use
alter table router_models add column if not exists cost_tier int not null default 3;
  -- 0 = free / local / subscription (sunk cost)   1 = cheap metered
  -- 2 = mid metered                               3 = expensive metered
alter table router_models add column if not exists context_window int;
alter table router_models add column if not exists is_safety_net boolean not null default false;
  -- The paid Claude lane. Auto mode must NEVER exclude it on cost — it sorts last and rises
  -- only when everything above it is circuit-open or capability-mismatched. It is a
  -- deliberate floor, not something to optimise away.
alter table router_models add column if not exists quota_ref text;

-- ---------------------------------------------------------------------------
-- 4. Per-account connectors. THE product requirement: one account may hold a subscription
--    connector AND an API-key connector for the same vendor at the same time, each its own
--    independently orderable lane. That is what the unique key permits.
-- ---------------------------------------------------------------------------

create table if not exists axon_account_connectors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  route_id uuid not null references router_routes(id),
  connector_kind text not null,
  status text not null default 'disconnected',  -- disconnected | connected | error | needs_reauth
  secret_key text,                              -- ni_platform_secrets key NAME, api kind only
  cli_session_meta jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,            -- the user's drag order in their Omni Router
  enabled boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, route_id, connector_kind)
);

-- ---------------------------------------------------------------------------
-- 5. Decision record — "what AXON is doing, and why". One row per routing call.
-- ---------------------------------------------------------------------------

create table if not exists axon_router_decisions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  agent_id uuid,
  request_id text,
  capability_class text not null,
  candidates jsonb not null default '[]'::jsonb,  -- ranked [{lane_id, model, score, reasons[]}]
  chosen_lane_id uuid references router_models(id),
  chosen_reason text not null,
  fell_through_from jsonb,                        -- [{lane_id, error}]
  created_at timestamptz not null default now()
);
create index if not exists axon_router_decisions_recent
  on axon_router_decisions (account_id, created_at desc);

alter table axon_account_connectors enable row level security;
alter table axon_router_decisions enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Default connector catalog — DATA, not hardcoded JSX. The Models page reads this.
-- ---------------------------------------------------------------------------

-- Classify the four routes that already exist live.
update router_routes set connector_kind = 'local' where name = 'ollama-local';
update router_routes set connector_kind = 'api'
  where name in ('anthropic-api', 'gemini-api', 'openrouter');

-- Subscription lanes. No HTTP API exists for a consumer subscription — the only way in is
-- the vendor's own CLI, signed into the account, on a machine the operator controls.
-- Reached over the existing nvg_mini_jobs queue. requires_mini = true is the honest
-- capability boundary for any tenant without one.
--
-- NOTE for whoever wires 2b: no separate 'claude-api' route is seeded. The existing
-- 'anthropic-api' row already holds ANTHROPIC_API_KEY; adding a second route under a new
-- name would duplicate the same credential under two identities. Use 'anthropic-api' as
-- the Claude API lane and 'claude-subscription' as the Claude subscription lane.
insert into router_routes (name, kind, connector_kind, cli_command, requires_mini, auth_scope, enabled)
values
  ('claude-subscription',  'subprocess', 'subscription', 'claude', true,
   'Claude Max/Pro, signed in on the operator machine', true),
  ('chatgpt-subscription', 'subprocess', 'subscription', 'codex',  true,
   'ChatGPT Plus/Pro/Team — cannot be reached by API key, CLI only', true),
  ('gemini-subscription',  'subprocess', 'subscription', 'gemini', true,
   'Google AI Pro/Ultra, signed in on the operator machine', true)
on conflict (name) do update
  set connector_kind = excluded.connector_kind,
      cli_command    = excluded.cli_command,
      requires_mini  = excluded.requires_mini,
      auth_scope     = excluded.auth_scope,
      updated_at     = now();

-- Capability + cost metadata on the lanes that already exist.
-- cost_tier 0 = free/local/subscription, and the scorer weights it so these outrank every
-- metered lane at equal capability fit. Free tiers first, paid genuinely last.
update router_models m set
  capabilities = case
    when m.model like 'axon-ornith%' then array['cheap_chat','tool_use_agentic']
    when m.model like 'axon-llama%'  then array['cheap_chat','code_build']
    else m.capabilities end,
  cost_tier = 0
from router_routes r
where m.route_id = r.id and r.name = 'ollama-local';

update router_models m set
  capabilities = array['cheap_chat','long_context','reasoning_planning'],
  cost_tier = 0
from router_routes r
where m.route_id = r.id and r.name = 'openrouter';

update router_models m set
  capabilities = array['cheap_chat','long_context','vision','tool_use_agentic'],
  cost_tier = case when m.model like '%flash%' then 0 else 2 end
from router_routes r
where m.route_id = r.id and r.name = 'gemini-api';

update router_models m set
  capabilities = array['code_build','reasoning_planning','tool_use_agentic','long_context','vision'],
  cost_tier = 3,
  is_safety_net = true
from router_routes r
where m.route_id = r.id and r.name = 'anthropic-api';

-- Subscription lanes get their models. cost_tier 0 — the subscription is already paid for,
-- so spending it is free at the margin and should be preferred over any metered call.
insert into router_models (route_id, model, tier_rank, priority, enabled, capabilities, cost_tier)
select r.id, v.model, 1, v.priority, true, v.caps, 0
from router_routes r
join (values
  ('claude-subscription',  'claude-sonnet-5', 10,
     array['cheap_chat','code_build','reasoning_planning','tool_use_agentic','long_context','vision']),
  ('chatgpt-subscription', 'gpt-5',           20,
     array['cheap_chat','code_build','reasoning_planning','tool_use_agentic','long_context','vision']),
  ('gemini-subscription',  'gemini-pro-latest', 30,
     array['cheap_chat','long_context','vision','reasoning_planning'])
) as v(route_name, model, priority, caps) on v.route_name = r.name
where not exists (
  select 1 from router_models m where m.route_id = r.id and m.model = v.model
);
