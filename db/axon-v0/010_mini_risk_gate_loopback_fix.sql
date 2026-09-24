-- AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917
-- Record of a fix already APPLIED live to fn_classify_mini_job_risk() on
-- 2026-09-24 (JB live "Yes unblock"). This file is the tracked SQL mirror the
-- ticket asked for -- it documents the function currently live in the DB, it
-- does not need to be re-run to take effect. CREATE OR REPLACE is safe to
-- re-apply if the DB definition ever needs restoring from this file.
--
-- Three changes bundled into the same live edit (see result_summary on
-- AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917 in agent_dispatch for the full trace):
--
-- 1. New loopback-inference branch: AXON's own local Ollama call
--    (curl -> http://localhost:11434/api/generate|chat -d '<single-quoted body>',
--    nothing trailing) now classifies 'medium' instead of falling through to
--    default-deny. Placed AFTER every Tier-3 hard-stop check and BEFORE the
--    billing/publish keyword checks, so a loopback call carrying the word
--    "payment" or "billing" inside the PROMPT TEXT no longer gets misread as
--    an actual billing action, while a genuinely destructive shape (rm -rf,
--    sudo, force-push, piped into sh) is still caught first regardless of a
--    loopback URL appearing anywhere in the line.
--
-- 2. Pre-existing regex hole fixed: Postgres `\b` is BACKSPACE, not a word
--    boundary (that's `\y`). The `sudo` and `git push --force` guards used
--    `\b`/`-f\b` and silently never fired -- `sudo rm /etc/passwd` and
--    `git push -f origin main` both classified as whatever fell through
--    (frequently 'medium'). Fixed to `\y`.
--
-- 3. Tier-2 loopback curl piped into a shell (`| sh`, `| bash`, `| zsh`) is
--    now excluded from the medium-reversible bucket and falls to default-deny
--    instead, closing the smuggling path the ticket's own follow-up note
--    flagged ("curl -d evades the (curl|wget) -X POST guard, tolerable today,
--    becomes a live hole once medium unblocks").
--
-- Mirrored client-side in lib/nvg-mini-risk-gate.mjs (ollama-local-generate
-- allowlist entry, tightened with the same single-quoted-body + end-anchor
-- requirement) in the same change that added this file.

CREATE OR REPLACE FUNCTION public.fn_classify_mini_job_risk(p_kind text, p_payload jsonb)
 RETURNS TABLE(risk_flag text, risk_reason text)
 LANGUAGE plpgsql
AS $function$
declare
  cmd text := coalesce(p_payload->>'cmd', p_payload->>'args', '');
  cmd_lc text := lower(cmd);
begin
  if p_kind in ('noop','screen') then
    return query select 'low', 'read-only/no-shell-surface kind';
    return;
  end if;

  -- TIER 3 (hard stop, default status forced to blocked_needs_jb)
  if (cmd_lc ~ '\mrm\M\s+-[a-z]*r' or cmd_lc ~ '\mrm\M\s+-[a-z]*f')
     and cmd_lc !~ 'rm\s+-[a-z]*\s+/tmp/'
     and cmd_lc !~ 'rm\s+-[a-z]*\s+\"?\$[a-z_]*tmp' then
    return query select 'high', 'irreversible delete outside /tmp (rm -r/-f on a non-tmp path)';
    return;
  elsif cmd_lc ~ 'git\s+push\s+.*(--force|-f\y)' or cmd_lc ~ 'git\s+branch\s+-D' or cmd_lc ~ 'git\s+reset\s+--hard' then
    return query select 'high', 'force-push, forced branch delete, or hard reset -- history-destructive';
    return;
  elsif cmd_lc ~ '(^|[;&|]\s*)sudo\y' or cmd_lc ~ 'mkfs' or cmd_lc ~ 'dd\s+if=' or cmd_lc ~ 'crontab\s+-r' or cmd_lc ~ 'kill\s+-9' then
    return query select 'high', 'privileged/system-level or process-killing command';
    return;
  elsif cmd_lc ~ '(drop\s+table|drop\s+database|truncate\s+|delete\s+from\s)' then
    return query select 'high', 'destructive SQL (DROP/TRUNCATE/DELETE)';
    return;
  elsif cmd_lc ~ '(nvg-mini\.env|\.env\b).*(>|>>|cat\s|echo\s)' or cmd_lc ~ 'chmod\s+.*\s(/etc|/usr|/system|/library)' or cmd_lc ~ 'launchctl\s+(unload|stop|disable|remove)' then
    return query select 'high', 'touches a credential file or a system/watchdog control path';
    return;
  -- JB 2026-09-24 live ("Yes unblock", AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917): AXON's own local-inference call.
  -- Exact shape only: curl [flags] to loopback Ollama generate/chat with ONE single-quoted -d body and nothing after it,
  -- so prompt TEXT inside the body (e.g. the word "payment") no longer trips the billing/publish keyword checks below.
  -- Destructive checks above still run first against the whole line.
  elsif cmd_lc ~ $re$^\s*curl(\s+-[a-z]+(\s+[0-9]+)?)*\s+https?://(localhost|127\.0\.0\.1):11434/api/(generate|chat)\s+-d\s+'([^']|'\\'')*'\s*$$re$ then
    return query select 'medium', 'AXON local loopback inference call (single-quoted body, no trailing shell)';
    return;
  elsif cmd_lc ~ 'stripe' or cmd_lc ~ 'billing' or cmd_lc ~ '\mcharge\M' or cmd_lc ~ 'payment' then
    return query select 'high', 'touches billing/payment/financial-transaction keywords';
    return;
  elsif cmd_lc ~ '/graph\.facebook\.com.*/(feed|photos|videos)' or cmd_lc ~ 'api\.twitter\.com' or cmd_lc ~ 'resend\.com/emails' or cmd_lc ~ '(curl|wget)\s+.*-x\s+(post|put|delete)' or cmd_lc ~ 'mail\s+-s' or cmd_lc ~ 'sendmail' then
    return query select 'high', 'looks like it sends/publishes directly to a public or person-facing endpoint from shell';
    return;
  end if;

  -- TIER 1 (low): pure read-only inspection, nothing else on the line
  if cmd_lc ~ '^\s*(ls|cat|head|tail|grep|find|ps|df|du|echo|pwd|whoami|git\s+(status|log|diff|show)|select\s)\S*(\s|$)'
     and cmd_lc !~ '(>|>>|\|\s*(sh|bash|xargs\s+rm))' then
    return query select 'low', 'read-only inspection command, no redirection/piping to a mutating command';
    return;
  end if;

  -- TIER 2 (medium): known, previously-proven, reversible operational patterns
  if cmd_lc ~ '(git\s+(add|commit|push)|npm\s+(install|run|test)|pip\s+install|mkdir|touch|mv\s|cp\s)'
     or cmd_lc ~ '(node|python3|python)\s+(scripts/|03_Agents/|\$HOME/|~/|lib/|[a-zA-Z0-9_-]+\.(mjs|js|py))'
     or (cmd_lc ~ '(curl|wget)\s+.*(localhost|127\.0\.0\.1|11434)' and cmd_lc !~ '\|\s*(sh|bash|zsh)\y')
     or cmd_lc ~ 'ollama\s+(run|list|ps|pull|cp)'
     or cmd_lc ~ 'codegraph\s+'
     or cmd_lc ~ '(nvg-media|/tmp/)'
     or cmd_lc ~ 'adb\s+(shell|devices|logcat)'
     or cmd_lc ~ 'launchctl\s+(list|print|bootstrap|kickstart)' then
    return query select 'medium', 'known reversible operational pattern';
    return;
  end if;

  -- DEFAULT DENY
  return query select 'high', 'unrecognized command shape -- default-deny, gated pending a human look rather than assumed safe';
end;
$function$;
