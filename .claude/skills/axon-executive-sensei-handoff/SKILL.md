---
name: axon-executive-sensei-handoff
description: How the daily AXON status report reaches SENSEI once the AXON Executive Agent exists — a Slack/GitHub-Actions handoff over agent_bus, replacing the old fixed 09:00 UTC standalone sensei-daily.yml cron. Use when AXON Executive Agent's daily run finishes and needs to hand its findings to SENSEI, when SENSEI needs to know why it isn't firing on a fixed clock anymore, or when checking whether the handoff actually happened.
---

# AXON Executive → SENSEI report handoff

Retired 2026-08-26 (this PR): the standalone daily cron in `.github/workflows/sensei-daily.yml`
(`0 9 * * *`) that used to fire SENSEI's report on a fixed clock, independent of anything else.
That schedule trigger is commented out in this same change. `workflow_dispatch` stays live so the
job can still be fired manually — by a human, by this skill's fallback path, or by CI while the
handoff below is still being built out.

**Why:** a fixed-clock report is blind to whether AXON actually finished its work for the day.
The handoff below makes SENSEI's report depend on a real signal — AXON Executive Agent saying
"here's what happened" — instead of a clock that fires whether or not there's anything real to
grade yet.

---

## 1. Precondition — LIVE (2026-09-04)

The precondition is met and the handoff has fired for real: **AXON Executive Agent** has a row in
`nvg_agent_routines`, and SENSEI's 2026-09-04 run read and answered a real `agent_bus` row
(`AXON-EXEC-AGENT-NIGHTLY-2026-09-04`, id `35640a3e-c859-4ced-9990-7a960456d935`) as its actual
grading material for that run — not a manual fallback fire.

Fixed 2026-09-04 (dispatch AXON-EXEC-HANDOFF-TO-AGENT-TARGET-0904): AXON Executive Agent now
addresses these rows `to_agent='SENSEI'`, matching Section 2 exactly. Previously it wrote
`to_agent='ALL'`; SENSEI found the rows via its normal ALL-inbox check either way, so the old
behavior never broke anything, but scoping is now correct.

## 2. The handoff, once AXON Executive Agent exists

1. **AXON Executive Agent finishes its daily run** — whatever its own report/status content is.
2. It writes one row to `agent_bus`:
   ```
   from_agent = 'AXON Executive Agent'
   to_agent   = 'SENSEI'
   subject    = 'AXON-EXEC-DAILY-REPORT-<YYYY-MM-DD>'   -- date-scoped, never reused, so a
                                                          -- retry doesn't collide with the same day
   body       = <the day's findings AXON Executive Agent wants graded/reported on>
   ```
   Follow `nvg-agent-comms`'s subject-naming and dead-letter rules for this row — this handoff is
   not exempt from those just because it's a new pattern.
3. **SENSEI reads `agent_bus` for unanswered rows addressed to it** (same mechanism every other
   agent-to-agent handoff in this system uses — see `nvg-agent-comms`). On finding an
   `AXON-EXEC-DAILY-REPORT-*` row, SENSEI runs its normal grading pass using that row's content as
   the day's material, then produces the report per `axon-sensei-report`'s locked structure
   (Sections 2-3 of that skill) — this handoff changes WHEN/WHY SENSEI runs, not WHAT it produces.
4. SENSEI marks the `agent_bus` row answered (per `nvg-agent-comms` convention) once its report is
   filed.

## 3. Fallback — if the handoff doesn't arrive

If no `AXON-EXEC-DAILY-REPORT-*` row lands in `agent_bus` addressed to SENSEI by **10:00 UTC**
(one hour past the old fixed slot):

- SENSEI (or the NVG Brain & Fleet Auditor, if it's the one that notices) manually fires
  `sensei-daily.yml` via `workflow_dispatch` so a report still goes out for the day.
- This is logged as a `[MISSED-HANDOFF]` note, not silently patched over — a pattern of misses here
  means AXON Executive Agent's own schedule is the thing that needs fixing, not this fallback.

## 4. What NOT to do

- Do not re-enable `sensei-daily.yml`'s `schedule:` trigger to "make sure it still runs" — that
  defeats the point of the handoff and duplicates the report. If the handoff is unreliable, fix the
  handoff (Section 3's fallback exists for exactly that gap) instead of reinstating the old clock.
- Do not mark this handoff "live" in any brain row until a real `agent_bus` row has actually been
  read and acted on by SENSEI — an unused mechanism is not a working one (same PROOF OVER STATUS
  rule as everywhere else).

## 5. Write-back

When this handoff fires for real the first time: log it to `Learnings` tagged `[LEARNED]` with the
`agent_bus` row id, and update this file's Section 1 precondition note to say it's live, dated.
