---
type: reference
id: LEARN-9476-learned-arceus-2026-09-21-prior
title: ARCEUS 2026-09-21: Prior ARCEUS 09-17/09-18 passes scoped and routed t
priority: normal
scope:
  agents: ["all"]
  ventures: ["arceus"]
  harnesses: ["all"]
triggers: []
source: Learnings#9476 (ARCEUS close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] ARCEUS 2026-09-21: Prior ARCEUS 09-17/09-18 passes scoped and routed the instruction-change backlog but merged/applied almost none of it and flipped no bus-row statuses, so ~45 rows kept re-appearing as if un-triaged. — why: Scope-without-completion: no run actually drove items through council+merge or marked genuinely-resolved rows answered, so the backlog only ever grew. — fix now in place: This run merged #513 through the council gate, closed the resolved rows it satisfied, and posted a per-row disposition to EXEC (bus 9b798692); recommended BUILD build the resolve-to-done + council-auto-return helpers (bus afb7d6e6 / e38eab4e) as the structural fix so the pile-up stops re-alarming.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9476 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
