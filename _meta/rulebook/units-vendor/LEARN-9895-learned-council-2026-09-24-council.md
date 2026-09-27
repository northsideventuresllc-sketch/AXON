---
type: reference
id: LEARN-9895-learned-council-2026-09-24-council
title: COUNCIL 2026-09-24: council-pr-review-record.mjs --dispatch raw-lens f
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#9895 (COUNCIL close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] COUNCIL 2026-09-24: council-pr-review-record.mjs --dispatch raw-lens fallback insert references a column agent_bus.priority that no longer exists (PGRST204), swallowing the nvg#16 lens verdict. — why: agent_bus schema has no 'priority' column but the recorder's raw-text rescue path still writes one. — fix now in place: Recorded nvg#16 manually with an honest PASS backed by a direct diff read (2 files: package.json+lock, patch-level next bump, no scope creep). Recorder root fix filed to BUILD and as an instruction_change.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9895 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
