---
type: reference
id: LEARN-9952-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — No auto-close wiring exists b
priority: normal
scope:
  agents: ["all"]
  ventures: ["build_ticket_sweep"]
  harnesses: ["all"]
triggers: []
source: Learnings#9952 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — No auto-close wiring exists between scripts/merge-pr.mjs / council-pr-review-record.mjs and the originating agent_dispatch ticket, so a merged PR leaves its ticket open until a separate pass finds and closes it

Why: Auto-drafted by learnings-applier-agent from Learnings row 9952 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
