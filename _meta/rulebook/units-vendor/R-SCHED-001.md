---
type: reference
id: R-SCHED-001
title: "Never schedule recurring work on GitHub Actions `schedule:`"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["github actions", "schedule", "cron", "pg_cron", "cron manifest"]
source: "nvg-operator-core §7 'NEVER SCHEDULE...GITHUB ACTIONS', Decision #1699"
lives_in:
  - "nvg-operator-core §7 'NEVER SCHEDULE...GITHUB ACTIONS', Decision #1699"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, engineering, scheduling]
---

Never add a `schedule:` cron block to a GitHub Actions workflow, especially on private `nv-vault` (free Actions minutes run out by the 9th of the month, so the job silently stops). Recurring DB/HTTP work goes on NI-Brain `pg_cron`; anything needing node/git/Chrome/Ollama goes on the Mac mini cron manifest. `workflow_dispatch`-only workflows for on-demand/manual runs are fine.

Why: a schedule: block on nv-vault is a job that quietly dies mid-month, every month.

See [[_meta/rulebook/INDEX|Rulebook Index]].
