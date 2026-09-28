---
type: reference
id: LEARN-10328-learned-build-2026-09-24-ticket
title: BUILD 2026-09-24: Ticket backlog (89 open, 49 queued) is outpacing cle
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10328 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: Ticket backlog (89 open, 49 queued) is outpacing clearance — most merge tickets point at PRs still in draft or explicitly flagged not-merged-pending-review by the sessions that opened them — why: Prior sessions are generating PRs and filing merge tickets faster than any session is running the full council-review-then-merge cycle on them, so the queue grows instead of draining — fix now in place: This run intentionally did not mass-merge; flagged the growth-vs-drain mismatch to JB directly instead of guessing at scale across 7 production repos in one unattended pass

Why: Auto-drafted by learnings-applier-agent from Learnings row 10328 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
