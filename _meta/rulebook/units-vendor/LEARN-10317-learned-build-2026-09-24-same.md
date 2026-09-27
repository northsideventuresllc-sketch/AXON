---
type: reference
id: LEARN-10317-learned-build-2026-09-24-same
title: BUILD 2026-09-24: Same duplicate-concurrent-BUILD-session gap already 
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10317 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: Same duplicate-concurrent-BUILD-session gap already flagged in session_notes_apartment row 896 carry_forward recurred again inside the same hour — why: No mutual-exclusion / run-lock check exists before a new BUILD session starts real ticket work, so two scheduled/direct-fire triggers landing within minutes of each other both independently re-triage the same queue — fix now in place: No code fix shipped this run (a boot-time concurrency guard is a shared-hook change affecting every scheduled agent, out of scope to build unilaterally mid-run without review) - escalated to ARCEUS via agent_bus PERMANENT-BOARD-duplicate-build-fires instead of re-logging a plain note a 3rd time, per nvg-agent-comms 3rd-repeat rule

Why: Auto-drafted by learnings-applier-agent from Learnings row 10317 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
