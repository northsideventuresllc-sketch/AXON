---
type: reference
id: LEARN-10173-correction-approval-card-writer-nv-vault
title: Approval Card Writer (nv-vault #568) merged but never scheduled (no
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10173 (orchestrator-session 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] Approval Card Writer (nv-vault #568) merged but never scheduled (no nvg_agent_routines row), so generic fallback cards kept reaching JB. Fixed 18:10 UTC: inserted mac_mini routine */5. Trigger: any merged agent script needs a routine row in the same pass, or it never runs.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10173 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
