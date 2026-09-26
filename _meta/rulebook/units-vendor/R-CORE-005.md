---
type: reference
id: R-CORE-005
title: "Ten-method rule before reporting blocked"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["blocked", "stuck", "parked", "ten method", "give up"]
source: "nvg-operator-core §4c"
lives_in:
  - "nvg-operator-core §4c"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, proof]
---

Nothing is blocked, parked, or stuck until 10 genuinely different routes have been tried and written down with what each returned. A retried transient error (502/timeout/rate-limit) is not a new route — back off (1s,2s,4s,8s, cap 5) on the same route first. "Leaves the building" actions never get forced through this way; those pause for JB regardless.

Why: stops premature escalation and silent give-ups.

See [[_meta/rulebook/INDEX|Rulebook Index]].
