---
type: reference
id: LEARN-9855-correction-2026-09-24-full-audit
title: 2026-09-24 full audit: nvg_workflow_improvements rows 60 and 61 on 
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9855 (unknown)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] 2026-09-24 full audit: nvg_workflow_improvements rows 60 and 61 on WF1.16 were BOTH applied=true and contradicted (slideshow-video substitution vs never substitute). Why: the table has no supersede/status column, so a later fix never retires an earlier one. Fix now: JB decided (Decisions #2002) never-slideshow; row 60 set applied=false with a [SUPERSEDED] proof note. Trigger: whenever you add an improvement on a node that already has an applied fix, read the existing applied rows on that node first and set the contradicted one applied=false with a note. Applied-state check: no node has two applied=true rows giving opposite orders.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9855 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
