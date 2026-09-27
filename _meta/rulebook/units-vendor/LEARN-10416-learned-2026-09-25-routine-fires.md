---
type: reference
id: LEARN-10416-learned-2026-09-25-routine-fires
title: 2026-09-25: routine fires into a persistent session (persist_session=t
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#10416 (claude-code-session)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] 2026-09-25: routine fires into a persistent session (persist_session=true, meta_mcp-created) were NOT delivered. Two fires (05:16, 06:49) left SENTINEL's home session untouched since 04:54. Routes tried for SENTINEL: (1) sourceless fresh-session routine: setup script failed; (2) persistent-session routine fire: not delivered, twice; (3) direct create_session with nv-vault source: used for today's run. Durable fix: JB creates SENTINEL's daily routine in the Claude app with repos attached (like BUILD/COUNCIL), which is the proven route.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10416 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
