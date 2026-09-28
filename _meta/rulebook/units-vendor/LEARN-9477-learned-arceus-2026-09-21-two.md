---
type: reference
id: LEARN-9477-learned-arceus-2026-09-21-two
title: ARCEUS 2026-09-21: Two retired/completed agents (PR Sweep Bot, Agentic
priority: normal
scope:
  agents: ["all"]
  ventures: ["arceus"]
  harnesses: ["all"]
triggers: []
source: Learnings#9477 (ARCEUS close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] ARCEUS 2026-09-21: Two retired/completed agents (PR Sweep Bot, Agentic OS Audit Session 2026-09-07) still held ACTIVE merge+deploy authority rows. — why: Retirement and session-end never revoked the authority row, and the registry check had not been crossing nvg_agent_authority(status=active) against nvg_agent_routines(retired_at/active=false). — fix now in place: Revoked both stale authority rows under Decision #1959 and added the authority-vs-routine cross-check as trigger-stated Learning #9470 for every future registry check.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9477 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
