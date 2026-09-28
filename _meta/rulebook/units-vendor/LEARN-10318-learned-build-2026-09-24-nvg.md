---
type: reference
id: LEARN-10318-learned-build-2026-09-24-nvg
title: BUILD 2026-09-24: nvg_agent_presence for BUILD was stale (last_seen_at
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10318 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: nvg_agent_presence for BUILD was stale (last_seen_at 14:57 UTC, status=idle) despite 3 close-outs having landed since 23:22 UTC, so a new fire had no reliable signal that a run was active or had just finished — why: Presence upserts are not happening consistently on every BUILD run, so even a correct lock check reading nvg_agent_presence would not have caught this particular overlap — fix now in place: This session did upsert nvg_agent_presence for BUILD on boot and close, narrowing (not closing) the presence-staleness half of the gap for the next run

Why: Auto-drafted by learnings-applier-agent from Learnings row 10318 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
