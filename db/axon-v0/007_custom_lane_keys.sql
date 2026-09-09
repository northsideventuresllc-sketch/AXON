-- AXON v0 — per-account keys for ANY lane, not just the 5-provider chain whitelist.
--
-- WHY THIS FILE EXISTS: axon_account_provider_keys (003) is keyed by (account_id, provider),
-- and `provider` is CHECK-constrained to the locked chain's 5 tiers (openrouter/gemini/
-- anthropic/runpod/deepseek). That made a brand-new custom lane ("Add Your Own" in
-- components/axon-v0/connector-catalog.tsx) unable to hold a self-serve key at all — the
-- catalog only ever accepted the NAME of an existing ni_platform_secrets row, never a raw
-- key value, so a genuinely new provider needed admin action (someone hand-adding a secret)
-- before it could work.
--
-- FIX: add a nullable `route_id` column keyed to router_routes.id — already unique per lane,
-- no whitelist needed, no enum to widen for the next provider anyone adds. A row is either
-- the legacy shape (provider set, route_id null — the 5 locked-chain tiers, read by
-- getAccountKey/setAccountKey in lib/axon-account-keys.mjs, completely untouched by this
-- migration) or the new shape (route_id set, provider null — any lane at all, read by the
-- new getAccountKeyForRoute/setAccountKeyForRoute). The XOR check keeps a row from ever being
-- ambiguous between the two. `unique (account_id, route_id)` is a plain (non-partial)
-- constraint — Postgres treats NULL <> NULL, so it imposes no uniqueness on the legacy rows
-- (route_id always null there) and real uniqueness on the new ones, which is exactly what
-- lets `on_conflict=account_id,route_id` upsert correctly (see setAccountKeyForRoute's doc
-- comment for why the bare merge-duplicates header alone is not enough).
--
-- Idempotent — safe to re-apply.

alter table axon_account_provider_keys
  add column if not exists route_id uuid references router_routes(id) on delete cascade;

alter table axon_account_provider_keys
  alter column provider drop not null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'axon_account_provider_keys_provider_route_xor') then
    alter table axon_account_provider_keys drop constraint axon_account_provider_keys_provider_route_xor;
  end if;
  alter table axon_account_provider_keys add constraint axon_account_provider_keys_provider_route_xor
    check (
      (provider is not null and route_id is null)
      or (provider is null and route_id is not null)
    );
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'axon_account_provider_keys_account_id_route_id_key'
  ) then
    alter table axon_account_provider_keys
      add constraint axon_account_provider_keys_account_id_route_id_key unique (account_id, route_id);
  end if;
end $$;
