---
type: reference
id: LEARN-10316-learned-build-2026-09-24-every
title: BUILD 2026-09-24: Every one of the 16 queued merge tickets pointed at 
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10316 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: Every one of the 16 queued merge tickets pointed at a PR still marked draft on GitHub; several PR bodies say do-not-merge outright, and some depend on other PRs merging first. — why: The check that marks a PR council-approved does not also check GitHub draft status or read the PR's own merge instructions, so not-ready PRs get queued as if ready. — fix now in place: No code changed this run. Logged a STALE-PROMPT learning naming the exact gap so whoever files these merge tickets adds a draft/ready check first. No merges performed.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10316 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
