-- OpenRouter route + model seed — adds the fourth route per
-- docs/axon-router-spec.md §1/§2/§3.
-- Idempotent: safe to run twice (on-conflict-do-nothing).

insert into router_routes (name, kind, secret_key, base_url) values
  ('openrouter', 'api', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1')
on conflict (name) do nothing;

insert into router_models (route_id, model, tier_rank, priority)
select r.id, m.model, m.rank, m.prio from router_routes r
join (values
  ('openrouter', 'deepseek/deepseek-v4-flash',                      3, 20),
  ('openrouter', 'minimax/minimax-m3:free',                         2, 10),
  ('openrouter', 'nvidia/nemotron-3-super-120b-a12b:free',          2, 20),
  ('openrouter', 'google/gemma-4-31b-it:free',                      2, 30)
) as m(route,model,rank,prio) on m.route = r.name
on conflict (route_id, model) do nothing;
