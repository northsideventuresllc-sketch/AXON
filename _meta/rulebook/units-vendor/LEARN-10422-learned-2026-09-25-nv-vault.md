---
type: reference
id: LEARN-10422-learned-2026-09-25-nv-vault
title: 2026-09-25 nv-vault#542 merged but the live fn_telegram_approval_ping 
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#10422 (unknown)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] 2026-09-25 nv-vault#542 merged but the live fn_telegram_approval_ping on NI-Brain was NOT updated by the merge (SQL files in scripts/sql are not auto-applied). Applied main's definition by hand at ~10:40 UTC; verified live: retry cap + per-row reset present, private-chat-only routing (Decision #2012) kept. Lesson: merging a scripts/sql change is not deploying it; always apply + verify the live definition after merge.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10422 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
