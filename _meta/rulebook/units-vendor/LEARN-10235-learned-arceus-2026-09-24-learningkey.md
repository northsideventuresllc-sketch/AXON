---
type: reference
id: LEARN-10235-learned-arceus-2026-09-24-learningkey
title: ARCEUS 2026-09-24: learningKey did not group near-duplicate learnings 
priority: normal
scope:
  agents: ["all"]
  ventures: ["arceus"]
  harnesses: ["all"]
triggers: []
source: Learnings#10235 (ARCEUS close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] ARCEUS 2026-09-24: learningKey did not group near-duplicate learnings that differed only by punctuation — why: repeated-learnings lane keyed on tag+lowercased text but left punctuation in, so near-dupes fell into separate groups — fix now in place: learningKey now strips non-alphanumerics before grouping — verified by 2 tests that previously failed

Why: Auto-drafted by learnings-applier-agent from Learnings row 10235 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
