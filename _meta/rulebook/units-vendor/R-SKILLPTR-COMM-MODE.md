---
type: reference
id: R-SKILLPTR-COMM-MODE
title: "Invoke comm-mode for how to phrase any plan/report to JB or council"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["comm mode", "plan approval wording", "report format"]
source: "golden skill comm-mode"
lives_in:
  - "nv-vault .claude/skills/comm-mode/SKILL.md"
  - "referenced by nvg-operator-core §3A step 3"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:comm-mode
tags: [rulebook, should, skill-pointer]
---

When a plan needs plain-English approval (task pipeline step 3) or a result needs reporting, invoke the `comm-mode` skill for the actual phrasing/format — this unit only records that the skill exists, is golden-adjacent, and where it plugs into the pipeline. Do not duplicate its body here; edit the skill directly for wording changes.

See [[_meta/rulebook/INDEX|Rulebook Index]].
