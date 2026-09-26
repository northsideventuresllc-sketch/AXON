---
type: reference
id: R-WORKFLOW-TASK-PIPELINE
title: "The Task Execution Pipeline is one locked sequence, not a per-repo variant"
priority: should
kind: workflow-step
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["task execution pipeline", "7 steps", "same for every harness"]
source: "Decision #1246/#1587/#1590 series; nvg-operator-core §3A"
lives_in:
  - "nv-vault .claude/skills/nvg-operator-core/SKILL.md §3A"
  - "nv-vault Workflows & SOPs/Task Execution Pipeline — Locked (2026-08-31).md"
  - "every repo CLAUDE.md 'EVERY TASK' block (6 repos)"
  - "DB: axon_venture_agents.config->>'instructions' (≥4 rows, byte-identical pipeline text)"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, workflow, pipeline]
---

Every non-trivial task on every harness runs the same 7-step sequence (context → goal+done → plan approved → execute → council+stress-test → ship via merge-pr.mjs → report+close) — re-locked 2026-08-31/2026-09-02 after it silently fell out of the operator-core skill once already. AXON's 46 `axon_venture_agents` rows carry the identical steps directly in their DB instructions, independent of any file.

See [[_meta/rulebook/INDEX|Rulebook Index]].
