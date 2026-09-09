-- AXON v0 — subscription lanes as opt-in locked-chain tiers (2026-09-09).
--
-- WHY THIS FILE EXISTS: db/axon-v0/002_router_core.sql already seeded three subscription
-- routes (claude-subscription / chatgpt-subscription / gemini-subscription, cli_command
-- 'claude' / 'codex' / 'gemini') and lib/axon-subscription-cli.mjs's callSubscriptionCli()
-- already runs them as a Mac-mini shell job — but ONLY the capability-scored lane pool
-- (listCandidateLanes/scoreLanes/executeLane) could ever reach them. axonGenerate(), the ONE
-- locked chain every plain-text chat call hits first (Decision #1721), never had a tier name
-- that resolved to a subscription route, so a JB subscription never actually ran for
-- ordinary chat. This file adds three new axon_llm_chain tier names
-- (claude_subscription/chatgpt_subscription/gemini_subscription — see
-- lib/axon-router-core.mjs TIER_ROUTE_NAME) so an account can opt a subscription into its
-- OWN chain. DEFAULT_LLM_CHAIN itself is untouched (Decision #1721, platform-wide locked
-- order) — this is additive and opt-in per account only, same as 005_deepseek_provider.sql.
--
-- SEPARATE FIX BUNDLED HERE: Google retired the old `gemini` CLI on 2026-06-18 for Pro/Ultra
-- subscribers (antigravity.google/docs/cli/gcli-migration, confirmed live 2026-09-09). Its
-- replacement is the Antigravity CLI (binary `agy`); lib/axon-subscription-cli.mjs's CLI
-- recipe was updated in the same change and this migration repoints the gemini-subscription
-- route's cli_command at it. See that file's CLI_SPECS.antigravity comment for exactly what
-- was confirmed from current docs vs. what remains unverified (JB has not installed
-- Antigravity yet).
--
-- Idempotent (on conflict do update / not-exists / drop-if-exists-then-add guards) so this
-- file can be re-applied safely, matching every prior file in this directory.

-- ---------------------------------------------------------------------------
-- 1. Widen axon_llm_chain's tier check constraint to allow the three new subscription tiers.
--    axon_account_provider_keys is untouched on purpose — subscriptions have no API key,
--    nothing to store there.
-- ---------------------------------------------------------------------------

alter table axon_llm_chain drop constraint if exists axon_llm_chain_tier_check;
alter table axon_llm_chain add constraint axon_llm_chain_tier_check
  check (tier in (
    'local', 'runpod', 'openrouter', 'gemini', 'anthropic', 'deepseek',
    'claude_subscription', 'chatgpt_subscription', 'gemini_subscription'
  ));

-- ---------------------------------------------------------------------------
-- 2. Antigravity CLI fix: gemini-subscription's cli_command moves from the retired `gemini`
--    binary to `antigravity` (lib/axon-subscription-cli.mjs CLI_SPECS.antigravity, which
--    builds `agy -p '<prompt>' --output-format json --print-timeout 35s`). claude-subscription
--    and chatgpt-subscription are left as-is — sanity-checked current, see that file's
--    comments on claude vs. the still-uncertain codex --json shape.
-- ---------------------------------------------------------------------------

update router_routes
  set cli_command = 'antigravity',
      auth_scope  = 'Google AI Pro/Ultra, via the Antigravity CLI (agy) signed in on the operator machine — replaces the retired `gemini` CLI (retired 2026-06-18)',
      updated_at  = now()
  where name = 'gemini-subscription'
    and (cli_command is distinct from 'antigravity' or auth_scope is distinct from 'Google AI Pro/Ultra, via the Antigravity CLI (agy) signed in on the operator machine — replaces the retired `gemini` CLI (retired 2026-06-18)');

-- ---------------------------------------------------------------------------
-- 3. JB's own axon_llm_chain — opt in the three subscription tiers.
--
--    Ordering reasoning (JB's call to make later; this is the starting order): subscriptions
--    are "already paid for," same sunk-cost logic as local/free-API lanes (cost_tier 0 on
--    their router_models rows already, per 002_router_core.sql). But unlike a plain HTTP
--    call, each one is a vendor CLI subprocess over the mini relay — slower to cold-start
--    than local/openrouter/gemini-api, and the Antigravity lane in particular carries a
--    documented headless-hang risk in non-TTY environments (see CLI_SPECS.antigravity
--    comment). So: keep the existing free HTTP lanes (local/runpod/openrouter/gemini-api)
--    ahead of the subscription CLIs, and keep the subscription CLIs ahead of the metered $
--    lanes (deepseek, anthropic) they're meant to substitute for. Within the three
--    subscriptions: claude_subscription first (matches router_models priority 10 vs. 20 vs.
--    30 already seeded for these routes, and Claude is JB's primary/highest-trust CLI here —
--    see 005_deepseek_provider.sql's "JB is at his Claude weekly cap" framing for why sparing
--    that cap matters), then chatgpt_subscription, then gemini_subscription last among the
--    three (the freshest/least field-proven of the three CLI integrations — real Antigravity
--    usage is unverified end-to-end as of this migration).
--
--    deepseek/anthropic keep their relative order to each other, just shifted later to make
--    room; existing tests / any other consumer of axon_llm_chain positions were checked and
--    nothing hardcodes JB's specific position numbers outside this file.
-- ---------------------------------------------------------------------------

update axon_llm_chain set position = 7, updated_at = now()
where account_id = '7e82a9db-b86e-4f21-b797-99b6931c9728'
  and tier = 'deepseek'
  and position is distinct from 7;

update axon_llm_chain set position = 8, updated_at = now()
where account_id = '7e82a9db-b86e-4f21-b797-99b6931c9728'
  and tier = 'anthropic'
  and position is distinct from 8;

insert into axon_llm_chain (account_id, tier, position, enabled)
values
  ('7e82a9db-b86e-4f21-b797-99b6931c9728', 'claude_subscription',  4, true),
  ('7e82a9db-b86e-4f21-b797-99b6931c9728', 'chatgpt_subscription', 5, true),
  ('7e82a9db-b86e-4f21-b797-99b6931c9728', 'gemini_subscription',  6, true)
on conflict (account_id, tier) do update
  set position   = excluded.position,
      enabled    = true,
      updated_at = now();

-- Resulting order for JB's account after this file:
--   0 local  1 runpod  2 openrouter  3 gemini(-api)  4 claude_subscription
--   5 chatgpt_subscription  6 gemini_subscription  7 deepseek  8 anthropic (safety net, last)
