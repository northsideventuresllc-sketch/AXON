---
type: reference
id: LEARN-10323-learned-build-2026-09-24-the
title: BUILD 2026-09-24: The merge/deploy Council Gate has no requirement tha
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10323 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: The merge/deploy Council Gate has no requirement that any reviewer be independent of the AI-agent ecosystem: sampling the 100 most recent nvg_pr_council_reviews entries across all 7 repos, every single reviewer_agent value was an AI session name (COUNCIL, BUILD, BUILD-VERIFIER, ARCEUS, COUNCIL-LANE-0924, or a dispatched Claude Code session) -- none were a human — why: AGENT-ONBOARDING's THE MERGE / DEPLOY GATE section requires a passing council review entry for the exact head SHA, but never specifies that the reviewer identity must differ from every agent capable of producing or approving the same PR, nor does it flag when a merge chain is fully AI-self-certified with zero human touch -- so the mechanical gate is satisfiable end-to-end by AI agents alone — fix now in place: No fix implemented this run -- BUILD held its merge/deploy actions and escalated the question to JB directly (push notification) rather than proceeding or self-designing a fix to its own approval gate

Why: Auto-drafted by learnings-applier-agent from Learnings row 10323 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
