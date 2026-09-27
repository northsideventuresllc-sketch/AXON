---
type: reference
id: LEARN-9833-learned-pulse-2026-09-23-the
title: PULSE 2026-09-23: The liveness alarm itself keeps regenerating the sam
priority: normal
scope:
  agents: ["all"]
  ventures: ["pulse"]
  harnesses: ["all"]
triggers: []
source: Learnings#9833 (PULSE close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] PULSE 2026-09-23: The liveness alarm itself keeps regenerating the same false-positive batch even though a ticket about it was marked answered a week ago — why: Alarm has no per-agent cadence awareness and depends on a run-timestamp column the harness never writes for Claude-Code-routine-type agents — fix now in place: Pointed re-escalation to BUILD naming that this is the 3rd identical batch today despite the prior answered ticket, asking for an actual code fix or a new owner

Why: Auto-drafted by learnings-applier-agent from Learnings row 9833 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
