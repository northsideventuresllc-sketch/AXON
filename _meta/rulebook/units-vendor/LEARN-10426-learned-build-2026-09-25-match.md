---
type: reference
id: LEARN-10426-learned-build-2026-09-25-match
title: BUILD 2026-09-25: Match Fit PR 426 went from clean to a real conflict 
priority: normal
scope:
  agents: ["all"]
  ventures: ["BUILD-repo-manager-scheduled"]
  harnesses: ["all"]
triggers: []
source: Learnings#10426 (BUILD close-out)
version: 1
updated: 2026-09-26
status: draft
---

[LEARNED] BUILD 2026-09-25: Match Fit PR 426 went from clean to a real conflict the moment PR 417 merged first, because both touched overlapping code — why: 417 and 426 both edited the same area of Match Fit independently; merging 417 first made 426 collide -- this was already flagged ahead of time on a separate tracked to-do, so it was expected, not a surprise — fix now in place: 426 is left conflicted on purpose and is already tracked on the existing conflict clean-up to-do -- the next run resolves it by pulling the latest main into that branch, never by force-pushing over it

Why: Auto-drafted by learnings-applier-agent from Learnings row 10426 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
