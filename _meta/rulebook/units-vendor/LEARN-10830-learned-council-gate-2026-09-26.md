---
type: reference
id: LEARN-10830-learned-council-gate-2026-09-26
title: COUNCIL GATE 2026-09-26: root causes observed — A scheduled cloud fire
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10830 (COUNCIL GATE close-out)
version: 1
updated: 2026-09-27
status: draft
---

[LEARNED] COUNCIL GATE 2026-09-26: root causes observed — A scheduled cloud fire cannot run the PAT-gated merge-pr.mjs: the environment credential guard blocks injecting GH_PAT. | The alternative GitHub-API merge path is explicitly awaiting JB ratification (decision 1e17030c, still null). | A concurrent live COUNCIL GATE session is already working the same queue, so a second merger thread would race it.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10830 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
