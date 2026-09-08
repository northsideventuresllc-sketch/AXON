-- AXON v0 — computer_use lane.
--
-- WHY THIS FILE EXISTS: db/axon-v0/002_router_core.sql (PR #133) shipped the 'computer_use'
-- capability class and left the actual lane row as the one remaining integration step —
-- "tagging one row is the whole integration when the computer_use lane from #131 lands"
-- (PR #133 description). This is that tag. The execution code it points at is
-- lib/axon-computer-use.mjs, wired into lib/axon-router-core.mjs executeLane().
--
-- No new tables. Idempotent (on conflict do update / not exists guards) so this file can be
-- re-applied safely.

insert into router_routes (name, kind, connector_kind, requires_mini, auth_scope, enabled)
values (
  'axon-computer-use',
  'api',
  'local',
  true,
  'Runs Claude Computer Use against the mini''s already-authenticated Chrome session — no separate credential.',
  true
)
on conflict (name) do update
  set connector_kind = excluded.connector_kind,
      requires_mini  = excluded.requires_mini,
      auth_scope     = excluded.auth_scope,
      updated_at     = now();

-- cost_tier 3 (metered, paid Anthropic API — same tier as the anthropic-api lane) and
-- is_safety_net = false: this lane only gets scored/picked when a caller explicitly sets
-- isComputerUse (see lib/axon-router-core.mjs classifyCapability), never as a fallback for
-- an unrelated capability class, so it does not compete with or need to outrank the plain
-- chat safety net.
insert into router_models (route_id, model, tier_rank, priority, enabled, capabilities, cost_tier, is_safety_net)
select r.id, 'claude-sonnet-5', 3, 10, true, array['computer_use'], 3, false
from router_routes r
where r.name = 'axon-computer-use'
  and not exists (
    select 1 from router_models m where m.route_id = r.id and m.model = 'claude-sonnet-5'
  );
