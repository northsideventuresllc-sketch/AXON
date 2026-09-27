---
type: reference
id: LEARN-10233-learned-arceus-2026-09-24-agent
title: ARCEUS 2026-09-24: agent_dispatch insert rejected: owner=JB not allowe
priority: normal
scope:
  agents: ["all"]
  ventures: ["arceus"]
  harnesses: ["all"]
triggers: []
source: Learnings#10233 (ARCEUS close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] ARCEUS 2026-09-24: agent_dispatch insert rejected: owner=JB not allowed, queued_by must be one of registry/hermes/manager/agent/jb, and human_only verification_spec must be {type:human_only,params:{reason}} — why: agent_dispatch has check constraints (owner allow-list is roster agents only; queued_by enum; a spec-gate trigger requires a typed non-empty verification_spec) that are not discoverable without hitting them — fix now in place: JB decisions route to owner=EXEC with needs_jb_approval=true; queued_by=agent; verification_spec={type:human_only,params:{reason}} — documented here so the next builder does not rediscover it

Why: Auto-drafted by learnings-applier-agent from Learnings row 10233 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
