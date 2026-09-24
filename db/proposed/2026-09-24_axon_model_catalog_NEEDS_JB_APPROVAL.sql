-- NEEDS JB APPROVAL - do not apply.
-- Live model discovery cache (lib/axon-model-discovery.mjs). One row per provider holding
-- the ranked live model ids from that provider's own catalog, refreshed at most every ~6h.
-- Without this table the router still works: it caches in-process only (each cold serverless
-- instance re-fetches the public catalog once). With it, one fetch per provider per ~6h is
-- shared by every instance, and a 404 / "model not found" anywhere invalidates it for all.
-- Service-role only (RLS on, no policies), same posture as the other router tables.

create table if not exists public.axon_model_catalog (
  provider   text primary key check (provider in ('gemini','openrouter','anthropic','ollama')),
  models     jsonb not null default '[]'::jsonb,   -- ranked model ids, best first
  fetched_at timestamptz not null default now()
);

alter table public.axon_model_catalog enable row level security;

comment on table public.axon_model_catalog is
  'Live model discovery cache for the AXON LLM chain (axon-model-discovery.mjs). ~6h TTL; a model-not-found at call time resets fetched_at.';
