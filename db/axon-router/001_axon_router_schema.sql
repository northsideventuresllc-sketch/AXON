-- AXON multi-route router schema — per docs/axon-router-spec.md §3 and §8.
-- Idempotent: safe to run twice (create-if-not-exists tables/indexes, on-conflict-do-nothing seeds).
-- No health row = healthy — a router_health row exists only for a (route, model)
-- currently failing or cooling off.

create table if not exists router_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,     -- 'claude-cli' | 'anthropic-api' | 'gemini-api' | 'openrouter' | 'ollama-local'
  kind text not null check (kind in ('subprocess','api','local')),
  secret_key text references ni_platform_secrets(key),  -- null for claude-cli (subscription, no key)
  base_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tier lives HERE, per model. This is what makes the tier floor real.
create table if not exists router_models (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id) on delete cascade,
  model text not null,           -- exact provider model id, sent verbatim to the adapter
  tier_rank int not null check (tier_rank between 1 and 4),  -- 4=frontier 3=capable 2=free 1=local
  priority int not null default 100,  -- lower = preferred among equals
  enabled boolean not null default true,
  unique (route_id, model)
);
create index if not exists idx_router_models_pick on router_models (tier_rank desc, priority asc) where enabled;

create table if not exists router_health (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id) on delete cascade,
  model text not null default '',   -- '' = route-wide (a dead key kills every model behind it)
  status text not null default 'healthy' check (status in ('healthy','rate_limited','dead')),
  reason text,                      -- '429_upstream_congestion', '401_invalid_key', 'quota_exhausted'
  failure_count int not null default 0,
  backoff_seconds int not null default 0,
  retry_after timestamptz,          -- set ONLY for 'rate_limited'; self-clears past this time
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (route_id, model)
);
create index if not exists idx_router_health_lookup on router_health (route_id, model);
create index if not exists idx_router_health_retry on router_health (status, retry_after) where status = 'rate_limited';

-- §8 seed — load-bearing: with no router_models rows at rank >= 3, every
-- default call returns zero candidates and fails instantly.

insert into router_routes (name, kind, secret_key, base_url) values
  ('anthropic-api','api',  'ANTHROPIC_API_KEY', null),
  ('gemini-api',   'api',  'GEMINI_API_KEY',    null),
  ('ollama-local', 'local', null, 'http://localhost:11434')
on conflict (name) do nothing;

insert into router_models (route_id, model, tier_rank, priority)
select r.id, m.model, m.rank, m.prio from router_routes r
join (values
  ('anthropic-api','claude-sonnet-5',    4, 10),
  ('anthropic-api','claude-opus-5',      4, 20),
  ('gemini-api',   'gemini-pro-latest',     4, 30),
  ('gemini-api',   'gemini-2.5-flash',   3, 10),
  ('ollama-local', 'axon-ornith:latest', 1, 10),
  ('ollama-local', 'axon-llama:latest',  1, 20)
) as m(route,model,rank,prio) on m.route = r.name
on conflict (route_id, model) do nothing;
