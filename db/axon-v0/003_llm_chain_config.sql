-- AXON v0 — locked default LLM chain + per-account provider keys.
--
-- Phase 3 lane C1 (Decision #1721). Adds the account-scoped ordering/enable layer on top of
-- the existing router_routes/router_models catalog from 002_router_core.sql, and a small
-- keystore so an account can override the NVG platform key for openrouter/gemini/anthropic/
-- runpod with its own, without ever touching ni_platform_secrets.
--
-- Idempotent — safe to re-apply.

-- ---------------------------------------------------------------------------
-- 1. axon_llm_chain — one row per (account, tier). position + enabled are the operator's
--    hand on the locked 5-tier order. No rows for an account = the locked default order
--    below applies (see PLATFORM_ACCOUNT_ID / DEFAULT_LLM_CHAIN in lib/axon-router-core.mjs).
-- ---------------------------------------------------------------------------

create table if not exists axon_llm_chain (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  tier text not null check (tier in ('local', 'runpod', 'openrouter', 'gemini', 'anthropic')),
  position int not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (account_id, tier)
);
alter table axon_llm_chain enable row level security;
-- No policies are created on purpose: RLS enabled + zero policies = deny-by-default for the
-- anon/authenticated PostgREST roles. Only the service role (used server-side, never in the
-- browser) can read or write this table.

-- ---------------------------------------------------------------------------
-- 2. axon_account_provider_keys — one row per (account, provider). key_ciphertext is AES-
--    256-GCM ciphertext (see lib/axon-account-keys.mjs), never plaintext. last4 is the only
--    part of the key ever safe to render in a UI.
-- ---------------------------------------------------------------------------

create table if not exists axon_account_provider_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  provider text not null check (provider in ('openrouter', 'gemini', 'anthropic', 'runpod')),
  key_ciphertext text not null,
  last4 text,
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);
alter table axon_account_provider_keys enable row level security;
-- Same deny-by-default posture as axon_llm_chain — service role only.

-- ---------------------------------------------------------------------------
-- 3. Seed the locked default order for the platform account. Matches
--    ACCOUNT_ID_FALLBACK in lib/axon-v0/store.ts — the well-known id used when no real
--    axon_accounts row resolves yet.
-- ---------------------------------------------------------------------------

insert into axon_llm_chain (account_id, tier, position, enabled)
values
  ('00000000-0000-0000-0000-000000000001', 'local', 0, true),
  ('00000000-0000-0000-0000-000000000001', 'runpod', 1, true),
  ('00000000-0000-0000-0000-000000000001', 'openrouter', 2, true),
  ('00000000-0000-0000-0000-000000000001', 'gemini', 3, true),
  ('00000000-0000-0000-0000-000000000001', 'anthropic', 4, true)
on conflict (account_id, tier) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RunPod AXON v1 route + model. "Not deployed yet" per the standing AI Vault chain
--    rule (matchfit/AGENTS.md, northside-intelligence STANDING RULES #1) — seeded here so
--    the tier exists and orders correctly; axonGenerate() falls through to the next tier
--    until an endpoint is live. secret_key references the existing RUNPOD_AXON_V1_KEY row
--    in ni_platform_secrets (FK-enforced); base_url is left null on purpose and resolved at
--    call time from the RUNPOD_AXON_V1_ENDPOINT secret, since the endpoint can rotate
--    without a schema change.
-- ---------------------------------------------------------------------------

insert into router_routes (name, kind, connector_kind, secret_key, base_url, enabled)
values ('runpod-axon-v1', 'api', 'api', 'RUNPOD_AXON_V1_KEY', null, true)
on conflict (name) do nothing;

insert into router_models (route_id, model, tier_rank, priority, enabled, capabilities, cost_tier)
select r.id, 'axon-v1', 1, 15, true, array['cheap_chat', 'code_build'], 0
from router_routes r
where r.name = 'runpod-axon-v1'
  and not exists (
    select 1 from router_models m where m.route_id = r.id and m.model = 'axon-v1'
  );
