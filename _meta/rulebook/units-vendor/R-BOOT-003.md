---
type: reference
id: R-BOOT-003
title: "Golden skills load before any task-specific logic"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["golden skills", "skill registry", "boot sequence"]
source: "nvg-operator-core §3 Step 0"
lives_in:
  - "nvg-operator-core §3 Step 0"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, boot, skills]
---

Query `golden_skills where status='active'` (never hardcode the count or list) and load/invoke every row returned before any task-specific work starts — not even a quick answer first. Print the `nvg_skill_registry` on-demand index and invoke a skill from it only when its trigger genuinely matches.

See [[_meta/rulebook/INDEX|Rulebook Index]].
