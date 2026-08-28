-- AXON v0 harness schema — STAGED FOR JB APPROVAL, do not auto-apply.
-- Multi-tenant from day one: every table keyed by account_id.
-- Agent messages are one account-wide bus (cross-venture by design).
-- Tools attach to ventures via their own assignment table with per-venture config.

create table if not exists axon_accounts (
  id uuid primary key default gen_random_uuid(),
  ni_email text not null unique,
  display_name text not null default 'Operator',
  access_code_hash text,               -- mirrors axon_access; one AXON account per NI account
  boot_voice_line text not null default 'Welcome.',
  has_mini_access boolean not null default false,   -- gates subscription-CLI lanes (002)
  created_at timestamptz not null default now()
);

create table if not exists axon_ventures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references axon_accounts(id),
  name text not null,
  tagline text,
  accent text not null default '#00D4FF',
  sort_order int not null default 0,
  settings jsonb not null default '{}'::jsonb,   -- per-venture workspace customization
  created_at timestamptz not null default now()
);

create table if not exists axon_venture_agents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references axon_accounts(id),
  venture_id uuid not null references axon_ventures(id),
  role text not null,                  -- exec_assistant | build_manager | pulse | council | creator | custom
  name text not null,
  description text,
  is_template boolean not null default false,   -- saved as reusable template for other ventures
  auto_seed boolean not null default true,      -- built automatically on new ventures
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- One account-wide message bus. venture_id/agent_id are addressing, not walls:
-- any venture's group chat can address any agent on the account.
create table if not exists axon_agent_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references axon_accounts(id),
  venture_id uuid references axon_ventures(id),     -- room the message was posted in
  agent_id uuid references axon_venture_agents(id), -- speaking/addressed agent (null = user/system)
  thread text not null default 'group',             -- group | agent:<id> | sub:<id>
  sender text not null,                             -- 'user' | agent role/name
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists axon_agent_messages_room on axon_agent_messages (account_id, venture_id, thread, created_at);

-- Model providers live in router_routes / router_models (see 002_router_core.sql).
-- The old axon_model_providers table was removed from this migration before it was ever
-- applied: it duplicated router_routes and stored a raw api_key column, where router_routes
-- stores a secret_key NAME pointing at ni_platform_secrets. One provider table, one place
-- for secrets. Nothing to migrate — this table never existed.

create table if not exists axon_agent_model_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references axon_accounts(id),
  agent_id uuid not null references axon_venture_agents(id) unique,
  mode text not null default 'auto',                -- auto (scored routing) | fixed
  lane_id uuid references router_models(id),        -- a route x model pair; see 002
  fixed_order jsonb,                                -- optional custom lane order
  updated_at timestamptz not null default now()
);

-- Per-venture tool assignment + customization (tools themselves live in axon_user_tools).
create table if not exists axon_venture_tools (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references axon_accounts(id),
  venture_id uuid not null references axon_ventures(id),
  tool_slug text not null,                          -- references axon_user_tools.slug
  display_name text,                                -- per-venture rename
  notes text,
  config jsonb not null default '{}'::jsonb,        -- per-venture customization
  created_at timestamptz not null default now(),
  unique (venture_id, tool_slug)
);

-- Service-role only (matches existing axon_* table posture).
alter table axon_accounts enable row level security;
alter table axon_ventures enable row level security;
alter table axon_venture_agents enable row level security;
alter table axon_agent_messages enable row level security;
alter table axon_agent_model_assignments enable row level security;
alter table axon_venture_tools enable row level security;
