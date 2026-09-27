---
type: reference
id: LEARN-9448-project-applied-jb-approved-migration-nvg
title: Applied JB-approved migration nvg_review_artifacts (Decision #1888/#19
priority: normal
scope:
  agents: ["all"]
  ventures: ["NI-Brain / Artifact Pipeline"]
  harnesses: ["all"]
triggers: []
source: Learnings#9448 (BUILD dispatch pass)
version: 1
updated: 2026-09-25
status: draft
---

[PROJECT] Applied JB-approved migration nvg_review_artifacts (Decision #1888/#1944, Operator Review Artifact pipeline Phase 1) live to NI-Brain via Supabase MCP apply_migration -- table + v_nvg_review_artifacts_pending + v_nvg_review_artifacts_recent_decisions now exist. This was the Hard Stop blocking Phases 2-4 (agent_dispatch rows 647be78f/51a347fa/27095c19). Kicked off Phase 2 (API + review UI in northside-intelligence) as a PR via a background agent, working from a fresh /tmp clone because the local Hub-tree working copies for axon/matchfit/northside-intelligence were all EDEADLK-locked at dispatch time (heavy concurrent worktree contention) -- consistent with the known repo-lock-contention pattern; fresh depth=1 clones from origin/main bypass it cleanly.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9448 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
