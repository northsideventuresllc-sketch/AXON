# AXON Intern Agent — Liveness Dedup Auditor

Wave 0, first real intern agent. Role: cheap, bounded, read-only triage of
`agent_dispatch` noise created by the liveness-alert system (`LIVE-*` /
`LOOP-LIVE-*` codes) so BUILD/EXEC/JB don't have to eyeball 80+ near-duplicate
rows by hand every day.

## What it does

1. Takes queued `agent_dispatch` rows shaped like liveness alerts.
2. Groups them by `<trigger_or_source_id>::<alert_type>` (e.g.
   `trig_01FW1Z8njCLotxtwzVDo5g2x::NOT-ENABLED`).
3. Within each group, the earliest-created row is canonical; later rows are
   flagged as duplicate candidates.
4. Emits a JSON report. Optionally posts that report to `agent_bus`
   (`subject=intern-liveness-dedup-report`) if Supabase REST credentials are
   present in the environment.

## Why it's "hard to mess up"

- **Never writes to `agent_dispatch`.** It cannot close, verify, or delete a
  ticket. Worst case failure mode is a wrong grouping in a report — nobody's
  work gets silently dropped.
- **Degrades safely with no credentials.** With no `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`, it just prints the report to stdout instead of
  erroring, so it's runnable as a pure function anywhere Node runs (a
  cloud sandbox with no DB creds, the Mac mini with real creds, CI, etc.).
- **Pure grouping function is unit tested** (`lib.test.mjs`, 6 cases,
  `node --test`) — the grouping logic that decides "these are duplicates" is
  verified independent of any live DB.

## Running it

```bash
# Report only, from any JSON array of rows shaped { id, code, status, owner, created_at }
node run.mjs < rows.json

# Report + attempt an agent_bus write (only if creds are in env)
node run.mjs --bus < rows.json
```

Pull the input rows with:

```sql
select id, code, status, owner, created_at
from agent_dispatch
where status = 'queued' and (code like 'LOOP-LIVE-%' or code like 'LIVE-%')
order by created_at;
```

## Verified run (2026-08-18, BUILD scheduled task)

Run against the live queue at that time (`node run.mjs < rows.json` where
`rows.json` was the live `agent_dispatch` query above, pulled 2026-08-18
~00:11 UTC): **80 rows scanned**, grouped into **59 distinct trigger+alert
signatures**, with **21 duplicate groups** covering **21 collapsible rows**
(each duplicate group in this run happened to be a pair: the same
trigger+alert fired once under a `LIVE-` code and again ~1h later under a
`LOOP-LIVE-`/re-check code — e.g. `trig_01FW1Z8njCLotxtwzVDo5g2x::NOT-ENABLED`
appears as both `LIVE-trig_01FW1Z8njCLotxtwzVDo5g2x-NOT-ENABLED` and
`LOOP-LIVE-trig_01FW1Z8njCLotxtwzVDo5g2x-NOT-ENABLED`). The full report JSON
from that run is logged to `agent_bus`
(`subject=intern-liveness-dedup-report`,
`from_agent=AXON-INTERN-LIVENESS-DEDUP`) rather than committed as a repo
file, and is referenced from `agent_dispatch.WAVE0-AXON-INTERN-AGENT-0817`.

**Not done yet (explicitly out of scope for this run):** actually collapsing
the duplicate rows in `agent_dispatch`. This agent only recommends; a human
or a separate, write-authorized agent decides whether/how to close the
duplicates. `verification_spec` on the parent ticket is `human_only` — JB
needs to eyeball this before it's called "verified."

## Known limitation / next wave

This agent currently only *reads* rows handed to it via stdin — it does not
independently query Supabase, because this build's execution environment
(a scheduled cloud BUILD run) had no `SUPABASE_URL` / service-role
credentials available to a standalone script. On a host with real
credentials (e.g. the Mac mini), wiring a thin wrapper that runs the SQL
above and pipes it in is a ~10-line follow-up, not a redesign.
