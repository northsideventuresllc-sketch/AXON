---
type: reference
id: LEARN-10201-learned-pulse-2026-09-24-root
title: PULSE 2026-09-24: root causes observed — nvg_workflow_improvements has
priority: normal
scope:
  agents: ["all"]
  ventures: ["pulse"]
  harnesses: ["all"]
triggers: []
source: Learnings#10201 (PULSE close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] PULSE 2026-09-24: root causes observed — nvg_workflow_improvements has no application-layer writer to patch; rows are inserted by ad-hoc raw SQL from evaluating agent sessions, so a code-level fix was not possible — the fix had to live in the database itself | The dispatch reaper re-queues an already-shipped ticket back to queued/human_only whenever its close-out lacked a verification_spec, even when the underlying finding was already correctly resolved — this is what stranded the EXEC ticket after an earlier PULSE run had already solved it

Why: Auto-drafted by learnings-applier-agent from Learnings row 10201 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
