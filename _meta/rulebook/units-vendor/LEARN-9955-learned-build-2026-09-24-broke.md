---
type: reference
id: LEARN-9955-learned-build-2026-09-24-broke
title: BUILD 2026-09-24: broke — merge-pr.mjs's hasPassingCouncilReview used 
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#9955 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: broke — merge-pr.mjs's hasPassingCouncilReview used an exact-match repo=eq.<repo> filter -- AXON#256 merge refused with a false 'no passing council review' even though a genuine pass row existed, because council-pr-review-record.mjs had stored repo='AXON' while the CLI arg here was 'axon'

Why: Auto-drafted by learnings-applier-agent from Learnings row 9955 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
