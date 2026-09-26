---
type: reference
id: R-QUEUE-001
title: "Never silently skip a queued task"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["skip", "queued", "backlog", "needs_jb", "council dispatch"]
source: "nvg-operator-core §7 'NEVER SILENTLY SKIP A QUEUED TASK'; OPERATING-RULES.md §13"
lives_in:
  - "nvg-operator-core §7 'NEVER SILENTLY SKIP A QUEUED TASK'; OPERATING-RULES.md §13"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, execution, queue]
---

Every item a pass touches through a queue/backlog gets one of three real outcomes, never a bare skip-note: (1) real, verifiable progress, (2) council dispatched to decide when genuinely unsure, or (3) JB pinged with a specific decision brief when it is truly his call. "Left queued, needs judgment" with nothing else attached is not a valid end state, on any agent's queue.

Why: this exact silent-skip pattern caused a backlog to pile up unaddressed.

See [[_meta/rulebook/INDEX|Rulebook Index]].
