-- AXON v0 — DeepSeek as a fifth chain-eligible provider (multi-LLM fallback, 2026-09-09).
--
-- WHY THIS FILE EXISTS: JB is at his Claude weekly cap and wants AXON's locked chain to
-- keep working on whatever provider still has headroom instead of stalling on Claude. DeepSeek
-- is genuinely OpenAI-compatible, so lib/axon-router-core.mjs needs zero new call-shape code —
-- executeChainTier()'s existing generic branch (the one openrouter already rides) handles it
-- once TIER_ROUTE_NAME/TIER_KEY_PROVIDER know the tier name (see that file's 'deepseek' entries).
--
-- Deliberately does NOT touch DEFAULT_LLM_CHAIN — that's the platform-wide locked order
-- (Decision #1721). This only widens the two provider allowlists and gives JB's own account
-- an explicit axon_llm_chain (previously falling through to the platform default) with
-- deepseek slotted in as a paid-but-cheap tier ahead of the anthropic safety net.
--
-- Idempotent (on conflict do update/nothing, not-exists guards) so this file can be re-applied
-- safely.

-- ---------------------------------------------------------------------------
-- 1. Widen the two check constraints that only knew about the original four chain providers.
-- ---------------------------------------------------------------------------

alter table axon_llm_chain drop constraint if exists axon_llm_chain_tier_check;
alter table axon_llm_chain add constraint axon_llm_chain_tier_check
  check (tier in ('local', 'runpod', 'openrouter', 'gemini', 'anthropic', 'deepseek'));

alter table axon_account_provider_keys drop constraint if exists axon_account_provider_keys_provider_check;
alter table axon_account_provider_keys add constraint axon_account_provider_keys_provider_check
  check (provider in ('openrouter', 'gemini', 'anthropic', 'runpod', 'deepseek'));

-- ---------------------------------------------------------------------------
-- 2. deepseek-api route + model. base_url is DeepSeek's own OpenAI-compatible endpoint.
--    secret_key starts NULL on purpose: router_routes.secret_key has an FK into
--    ni_platform_secrets(key), and no DEEPSEEK_API_KEY row exists there because JB has no
--    DeepSeek account/key yet (2026-09-09) — inserting a placeholder secret would be a fake
--    credential, not a real one. With secret_key null, loadSecret() short-circuits to "no key
--    configured" and the chain falls through, exactly like an unconfigured runpod tier does
--    today. JB's own key (once he has one) goes through axon_account_provider_keys instead —
--    getAccountKey() is checked BEFORE route.secret_key in executeChainTier, so his personal
--    key works with no platform secret ever needed. If a platform-wide fallback key is wanted
--    later: insert the real ni_platform_secrets row, then
--    `update router_routes set secret_key = 'DEEPSEEK_API_KEY' where name = 'deepseek-api'`.
-- ---------------------------------------------------------------------------

insert into router_routes (name, kind, connector_kind, secret_key, base_url, enabled)
values ('deepseek-api', 'api', 'api', null, 'https://api.deepseek.com', true)
on conflict (name) do update
  set base_url    = excluded.base_url,
      updated_at  = now();

-- cost_tier 1: DeepSeek is metered but cheap — ahead of the paid Anthropic safety net,
-- behind the genuinely free/subscription lanes, matching COST_SCORE's weighting.
insert into router_models (route_id, model, tier_rank, priority, enabled, capabilities, cost_tier)
select r.id, 'deepseek-chat', 3, 40, true,
  array['cheap_chat', 'code_build', 'long_context', 'reasoning_planning'], 1
from router_routes r
where r.name = 'deepseek-api'
  and not exists (
    select 1 from router_models m where m.route_id = r.id and m.model = 'deepseek-chat'
  );

-- ---------------------------------------------------------------------------
-- 3. JB's account connector card — shows up in Settings as "Deepseek · API Key",
--    disconnected until he pastes a key (no DeepSeek account/key exists yet per JB, 2026-09-09).
-- ---------------------------------------------------------------------------

insert into axon_account_connectors (account_id, route_id, connector_kind, status, secret_key, sort_order, enabled)
select a.id, r.id, 'api', 'disconnected', 'DEEPSEEK_API_KEY', 7, true
from axon_accounts a, router_routes r
where a.ni_email = 'northside.ventures.llc@gmail.com'
  and r.name = 'deepseek-api'
on conflict (account_id, route_id, connector_kind) do nothing;

-- ---------------------------------------------------------------------------
-- 4. JB's own axon_llm_chain — he had zero rows (running on the platform default, which
--    does not include deepseek). Explicit rows for his account only, deepseek slotted in
--    ahead of the anthropic safety net; everyone else stays on the untouched platform default.
-- ---------------------------------------------------------------------------

insert into axon_llm_chain (account_id, tier, position, enabled)
select a.id, v.tier, v.position, true
from axon_accounts a
join (values
  ('local', 0), ('runpod', 1), ('openrouter', 2), ('gemini', 3), ('deepseek', 4), ('anthropic', 5)
) as v(tier, position) on true
where a.ni_email = 'northside.ventures.llc@gmail.com'
on conflict (account_id, tier) do nothing;
