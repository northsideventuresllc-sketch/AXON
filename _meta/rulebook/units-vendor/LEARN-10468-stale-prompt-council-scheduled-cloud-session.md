---
type: reference
id: LEARN-10468-stale-prompt-council-scheduled-cloud-session
title: COUNCIL scheduled cloud session (2026-09-25) is harness-permissio
priority: normal
scope:
  agents: ["all"]
  ventures: ["NVG-ops"]
  harnesses: ["all"]
triggers: []
source: Learnings#10468 (COUNCIL scheduled run 2026-09-25)
version: 1
updated: 2026-09-26
status: draft
---

[STALE-PROMPT] COUNCIL scheduled cloud session (2026-09-25) is harness-permission-restricted: the auto-mode classifier hard-blocks merge-pr.mjs (Merge Without Review), agent fires, and even reads of nvg_agent_routines (Production Deploy), independent of a valid active nvg_agent_authority row (COUNCIL can_merge_to_main=true) and a satisfied merge gate. Same class as the fn_morality_clear block and Learning #10423. Effect: COUNCIL-cloud can review + record DB rows + close tickets but CANNOT merge/deploy/fire, so the review->merge half of its ~55 open tickets cannot complete from a scheduled cloud run. Fix: grant the COUNCIL routine merge/deploy/fire permission in its launch config, or route merges to BUILD whose config permits them. Not worked around per the denial instruction.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10468 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
