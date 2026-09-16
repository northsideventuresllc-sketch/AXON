CREATE OR REPLACE FUNCTION public.fn_ticket_escalate(p_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; v_next int; v_technical boolean; v_helper_key text; v_stage text;
begin
  select * into r from agent_dispatch where id = p_id;
  if r is null then return 'no such ticket'; end if;

  -- preserve the ORIGINAL owner the very first time we escalate
  if r.esc_owner is null and r.owner is not null and r.owner <> 'manager' then
    update agent_dispatch set esc_owner = r.owner where id = p_id;
    r.esc_owner := r.owner;
  end if;

  v_next := r.esc_rung + 1;
  v_technical := coalesce(p_reason,'') ~* '(technical|infra|mini|offline|stall|stalled|timeout|crash|error|process|died|heartbeat|token|limits)';

  if v_next = 1 then
    -- RUNG 1: helper agent for the lane. Technical -> fallback executor. Otherwise re-fire the owner for a fresh attempt.
    v_stage := 'helper';
    if v_technical then
      -- Failover directly to antigravity_gemini instead of PULSE
      perform fn_bus_notify('PULSE', 'Failover: ' || r.code, 'Technical stall on ticket '||r.code||'. '||coalesce(p_reason,'')||' Failing over to antigravity_gemini.');
      update agent_dispatch set esc_rung=1, status='queued', executor='antigravity_gemini',
        result_summary = coalesce(result_summary,'')||E'\n[ESCALATE r1/helper '||to_char(now(),'YYYY-MM-DD HH24:MI')||'] '||coalesce(p_reason,'')||' -> failed over to antigravity_gemini.'
        where id=p_id;
    else
      v_helper_key := fn_agent_secret_key(coalesce(r.esc_owner, r.owner));
      if v_helper_key is not null then perform fn_fire_agent(v_helper_key); end if;
      perform fn_bus_notify(coalesce(r.esc_owner, r.owner,'ALL'), 'Retry: ' || r.code, 'Fresh attempt on stalled ticket '||r.code||'. '||coalesce(p_reason,'')||' If you finish, close it; if still stuck, call fn_ticket_escalate('''||p_id||''',<why>) to reach COUNCIL.');
      update agent_dispatch set esc_rung=1, status='blocked',
        result_summary = coalesce(result_summary,'')||E'\n[ESCALATE r1/helper '||to_char(now(),'YYYY-MM-DD HH24:MI')||'] '||coalesce(p_reason,'')||' -> helper dispatched; returns to owner on resolve.'
        where id=p_id;
    end if;

  elsif v_next = 2 then
    -- RUNG 2: COUNCIL for advice.
    v_stage := 'council';
    perform fn_fire_agent('AGENT_FIRE_COUNCIL');
    perform fn_bus_notify('COUNCIL', 'Advice needed: ' || r.code, 'Ticket '||r.code||' is stuck after a helper attempt. '||coalesce(p_reason,'')||' Advise the fix, then call fn_ticket_resolve('''||p_id||''',''COUNCIL'',<advice>) so owner ('||coalesce(r.esc_owner,'?')||') completes. If COUNCIL cannot resolve, call fn_ticket_escalate('''||p_id||''',<why>) to reach JB.');
    update agent_dispatch set esc_rung=2, status='blocked',
      result_summary = coalesce(result_summary,'')||E'\n[ESCALATE r2/council '||to_char(now(),'YYYY-MM-DD HH24:MI')||'] '||coalesce(p_reason,'')||' -> COUNCIL dispatched.'
      where id=p_id;

  else
    -- RUNG 3: JB, plain English.
    v_stage := 'jb';
    update agent_dispatch set esc_rung=3, status='needs_jb', needs_jb_approval=true,
      jb_ask = 'One of your agents is stuck and neither it, its helper, nor the council could solve it: '||coalesce(r.title,r.code)||'. '||coalesce(p_reason,'')||E'\nAnswer here and it goes straight back to the agent to finish — you do not have to do the work.',
      result_summary = coalesce(result_summary,'')||E'\n[ESCALATE r3/JB '||to_char(now(),'YYYY-MM-DD HH24:MI')||'] helper + COUNCIL exhausted; raised to JB in plain English.'
      where id=p_id;
  end if;

  return 'escalated to ' || v_stage;
end;
$function$;
ALTER TABLE agent_dispatch ALTER COLUMN executor SET DEFAULT 'antigravity_gemini';
CREATE OR REPLACE FUNCTION public.fn_liveness_watch_check()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare r record; v_code text; v_loop_count int := 0; v_alert_count int := 0;
begin
  for r in select * from v_liveness_alerts loop
    v_code := 'LIVE-' || coalesce(r.subject, r.label) || '-' || r.alert;
    v_code := left(regexp_replace(v_code, '[^a-zA-Z0-9_-]', '-', 'g'), 80);
    if r.minutes is not null and r.minutes >= 60 then
      v_code := 'LOOP-' || v_code;
      if not exists (select 1 from agent_dispatch where code = v_code and status not in ('done','skipped','rejected'))
         and not exists (select 1 from agent_dispatch where code = v_code and completed_at > now() - interval '3 days') then
        -- Failover to antigravity_gemini
        insert into agent_dispatch (code, title, status, priority, owner, action_class, executor)
        values (v_code, 'Silent agent: ' || r.kind || ' "' || r.label || '" has been quiet ' || r.minutes || ' min (' || r.alert || '). Find the real cause in the routine''s own run history (Claude routine last_run, nvg_agent_presence, session_notes_apartment), fix or re-fire it, and write one [LOOP-AUTO] Learning. Close with proof.', 'queued', 1, 'PULSE', 'automation', 'antigravity_gemini');
        v_loop_count := v_loop_count + 1;
      end if;
    else
      if not exists (select 1 from agent_dispatch where code = v_code and status not in ('done','skipped','rejected'))
         and not exists (select 1 from agent_dispatch where code = v_code and completed_at > now() - interval '3 days') then
        -- Failover to antigravity_gemini
        insert into agent_dispatch (code, title, status, priority, owner, action_class, executor)
        values (v_code, 'Liveness alert: ' || r.kind || ' "' || r.label || '" -- ' || r.alert || ' (' || r.minutes || ' min)', 'queued', 1, 'PULSE', 'automation', 'antigravity_gemini');
        v_alert_count := v_alert_count + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'loop_engineering_triggered', v_loop_count, 'plain_alerts', v_alert_count);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_mini_watchdog_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_age interval;
  v_code text := 'MINI-DOWN-' || to_char(now(), 'YYYYMMDD');
begin
  select now() - last_seen into v_age from nvg_mini_heartbeat limit 1;

  if v_age is null or v_age > interval '10 minutes' then
    if not exists (select 1 from agent_dispatch where code = v_code and status in ('queued','needs_jb','needs_context','in_progress','blocked')) then
      insert into agent_dispatch (code, title, status, priority, owner, needs_jb_approval, action_class, verification_spec, result_summary, executor)
      values (v_code,
              'Mac mini job-queue runner heartbeat stale/missing, age=' || coalesce(v_age::text,'no rows'),
              'needs_jb', 0, 'manager', true, 'human_only',
              jsonb_build_object('type','human_only','params',jsonb_build_object('reason','runner heartbeat must advance; watchdog row')),
              'The Mac mini job runner has stopped checking in. On the mini, run: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nvg.mini-runner.plist  (if it says already loaded: launchctl kickstart -k gui/$(id -u)/com.nvg.mini-runner). Merges and mini jobs wait until it is back.',
              'antigravity_gemini');
    end if;
  end if;
end;
$function$;
