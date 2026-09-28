---
type: reference
id: LEARN-10310-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — Whatever step sets status=nee
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10310 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — Whatever step sets status=needs_jb on this ticket family does not enforce that jb_ask gets populated in the same write, so a ticket can land in needs_jb silently empty

Why: Auto-drafted by learnings-applier-agent from Learnings row 10310 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
