-- NEEDS JB APPROVAL - do not apply.
-- AG-VERIFY-CHAIN-EXHAUSTION-0924. Proposed by the chain-fix PR; the code in this PR works
-- without either statement (it already skips the retired model and falls through on a block).
-- These two changes just remove the root data problem and stop the card flood on the server
-- side too. The gate POLICY (what counts as high risk) is NOT changed here: that is
-- AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917, still waiting on JB.

-- 1. (DROPPED 2026-09-24, superseded by live model discovery — lib/axon-model-discovery.mjs.)
--    GEMINI_MODEL is now only an optional pin: a value missing from Google's live ListModels
--    catalog is ignored with a logged warning, so the stale 'gemini-2.0-flash' row is
--    harmless. Clearing it is optional housekeeping, not required:
--      -- delete from ni_platform_secrets where key = 'GEMINI_MODEL' and value = 'gemini-2.0-flash';

-- 2. Server-side card dedupe. The trigger opens one JB approval card per blocked job, so a
--    repeating blocked local-model call opened one card a minute. With this change, one
--    blocked job SIGNATURE (same title + same risk_reason) opens at most one open card per
--    24h. Repeats are still blocked and still audited in nvg_mini_jobs; they just attach to
--    the open card, which gets a counter note, instead of opening a new one.
create or replace function public.fn_gate_mini_job_before_insert()
 returns trigger
 language plpgsql
as $function$
declare
  v_flag text;
  v_reason text;
  v_should_classify boolean;
  v_title text;
  v_clean_title text;
  v_open_code text;
begin
  v_should_classify := new.kind in ('shell','adb') and (
    tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status is distinct from old.status)
  );

  if v_should_classify then
    select risk_flag, risk_reason into v_flag, v_reason
      from fn_classify_mini_job_risk(new.kind, new.payload);
    new.risk_flag := v_flag;
    new.risk_reason := v_reason;

    if v_flag = 'high' and coalesce(new.status, 'queued') = 'queued' then
      new.status := 'blocked_needs_jb';
      v_title := coalesce(new.title, 'Mac mini background task');
      v_clean_title := regexp_replace(v_title, '^(Blocked mini shell job \(unallowlisted\):\s*|Blocked mini job:\s*)', '', 'i');

      select code into v_open_code
        from agent_dispatch
       where code like 'MINI-BLOCKED-%'
         and status = 'needs_jb'
         and title = left(v_clean_title, 200)
         and result_summary like left(coalesce(v_reason, 'unclassified'), 120) || '%'
         and created_at > now() - interval '24 hours'
       order by created_at desc
       limit 1;

      if v_open_code is not null then
        update agent_dispatch
           set result_summary = left(
                 regexp_replace(coalesce(result_summary, ''), '\s*\[repeats: \d+\]$', '')
                 || ' [repeats: '
                 || (coalesce(substring(result_summary from '\[repeats: (\d+)\]$')::int, 0) + 1)
                 || ']', 1000),
               updated_at = now()
         where code = v_open_code;
      else
        insert into agent_dispatch (
          code, title, owner, status, action_type, risk_tier, executor,
          queued_by, needs_jb_approval, source, result_summary,
          jb_ask, jb_options
        ) values (
          'MINI-BLOCKED-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
            || '-' || substr(md5(random()::text), 1, 6),
          left(v_clean_title, 200),
          'runner', 'needs_jb', 'none', 'jb_only', 'jb_manual',
          'agent', true, 'AX-MINI-JOBS-NO-TIER-GATE-0813',
          left(coalesce(v_reason, 'unclassified') || ' | cmd: '
            || coalesce(new.payload->>'cmd', new.payload->>'args', ''), 400),
          'Approve running command: ' || left(v_clean_title, 120) || '?',
          '["Run Command", "Cancel Job"]'::jsonb
        );
      end if;
    end if;
  end if;

  return new;
end;
$function$;
