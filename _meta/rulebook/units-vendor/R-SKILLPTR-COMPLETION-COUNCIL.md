---
type: reference
id: R-SKILLPTR-COMPLETION-COUNCIL
title: "Invoke nvg-completion-council as the mandatory review gate"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["completion council", "review gate", "lenses", "reject redo"]
source: "golden skill nvg-completion-council"
lives_in:
  - "nv-vault .claude/skills/nvg-completion-council/SKILL.md"
  - "DB tables: nvg_council_decisions, nvg_council_settings, nvg_pr_council_reviews"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:nvg-completion-council
tags: [rulebook, should, skill-pointer]
---

`nvg-completion-council` is the full mechanism behind R-COUNCIL-001: dispatches a council of subagents, each checking a different lens, against the done-criteria from nvg-task-scoping. Reject sends work back to the original agent, up to 5 rounds, before escalating.

See [[_meta/rulebook/INDEX|Rulebook Index]].
