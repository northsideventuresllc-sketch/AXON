-- AX-SMALL-BUILDS-BUNDLE-0904 item (2): high-stakes thread flag for agent_bus.
--
-- NOT APPLIED. This is a migration file for a human (JB) to review and run by
-- hand against NI-Brain (kxijunwgbrlfzvgkhklo) — this PR's author had no live
-- write access to that project (Supabase MCP token was unauthorized in this
-- sandbox) and per standing instruction never applies DDL/migrations directly.
--
-- SCHEMA ASSUMPTION (verify before applying): agent_bus has at least these
-- columns — id, from_agent text, to_agent text, subject text, body jsonb,
-- needs_answer boolean, status text, answered_by text, answered_at timestamptz,
-- created_at timestamptz. This is inferred from every existing call site
-- against this table (lib/axon-agent-bus.mjs, lib/axon-agent-comms.mjs,
-- lib/axon-executive-agent.mjs, lib/axon-arceus-core.mjs, lib/axon-roster-fire.mjs,
-- lib/axon-content-scaffold-shared.mjs), NOT by querying live
-- information_schema.columns. Re-run this before applying:
--
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'agent_bus'
--   order by ordinal_position;
--
-- DESIGN: a VIEW, not a new column. Applying this can never fail an existing
-- insert/patch against agent_bus and can never desync from it (it's computed,
-- not stored) — purely additive, read-only, safe to apply or drop at any time.
--
-- HEURISTIC (mechanical, no LLM call — same "nothing paid without JB" reasoning
-- as axon-arceus-registry-check.mjs and axon-deploy-qa.mjs): a thread is
-- high_stakes when it is still open AND needs an answer AND at least one of:
--   (a) its subject/task text matches the same gated-action keywords
--       lib/axon-agent-bus.mjs's classifyGatedAction() already uses to decide
--       whether a fire needs the FIRE/HOLD gate (merge/deploy/publish/reddit/
--       cron-enable/dispatch-fire) — these are exactly the actions JB already
--       treats as consequential elsewhere in this codebase, reused here rather
--       than inventing a second risk taxonomy;
--   (b) its body carries an explicit `gated` marker (fireAgent() attaches one
--       when a fire was refused by the gate — that refusal is itself something
--       JB should see, not just the agent that got refused);
--   (c) it has sat open, unanswered, for more than 24h (the same staleness
--       window scripts/backlog-janitor.mjs uses for "this needs a human look").
--
-- This is a best-effort SQL mirror of classifyGatedAction()'s GATE_ACTION_HINTS
-- regexes in lib/axon-agent-bus.mjs plus MERGE_DEPLOY_RE — kept approximate on
-- purpose (substring match, not the exact \b-anchored JS regex) since this view
-- is a coarse operator filter, not a gate decision. The real gate decision
-- still runs in JS via classifyGatedAction()/assertFireAllowed() — this view
-- never gates anything, it only surfaces threads for a human to look at.
-- lib/axon-agent-bus-high-stakes.mjs's computeHighStakesLocally() fallback
-- calls the real classifyGatedAction()/isMergeDeployAction() directly (no
-- duplicated regex there), so if this SQL pattern and the JS gate hints drift
-- apart, the JS fallback path stays authoritative — update this comment/
-- pattern by hand if lib/axon-agent-bus.mjs's GATE_ACTION_HINTS or
-- MERGE_DEPLOY_RE ever change.

CREATE OR REPLACE VIEW public.agent_bus_high_stakes_v AS
SELECT
  ab.*,
  (
    ab.needs_answer IS TRUE
    AND ab.status = 'open'
    AND (
      ab.subject ~* '(merge|deploy|release|push to (main|prod)|publish|reddit|fire (a )?dispatch|repo manager dispatch|enable.*cron|turn on.*(cron|schedule))'
      OR (ab.body ->> 'task') ~* '(merge|deploy|release|push to (main|prod)|publish|reddit|fire (a )?dispatch|repo manager dispatch|enable.*cron|turn on.*(cron|schedule))'
      OR ab.body ? 'gated'
      OR ab.created_at < now() - interval '24 hours'
    )
  ) AS high_stakes
FROM public.agent_bus ab;

COMMENT ON VIEW public.agent_bus_high_stakes_v IS
  'AX-SMALL-BUILDS-BUNDLE-0904 item 2: read-only high_stakes filter over agent_bus for the operator surface (lib/axon-agent-bus-high-stakes.mjs, app/api/axon-v0/agent-bus/high-stakes). Heuristic only, kept in sync with computeHighStakesLocally() in that lib file by hand.';

-- Rollback: `DROP VIEW IF EXISTS public.agent_bus_high_stakes_v;` — the
-- application code in lib/axon-agent-bus-high-stakes.mjs falls back to
-- computing the same heuristic client-side against agent_bus directly if this
-- view is absent, so dropping it does not break the operator surface, it just
-- moves the computation back off the DB.
