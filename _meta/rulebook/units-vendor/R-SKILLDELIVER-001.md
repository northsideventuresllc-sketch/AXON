---
type: reference
id: R-SKILLDELIVER-001
title: "Skill deliveries to JB are `.skill` zips, never a plain `.md`"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["skill delivery", ".skill zip", "send skill to jb"]
source: "nvg-operator-core §4f"
lives_in:
  - "nvg-operator-core §4f"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, skills]
---

Package a skill for JB as a folder (`skill-name/SKILL.md`) zipped to `<skill-name>.skill` before sending — a bare `.md` lands as a generic upload with no "update skill" option in the file card.

See [[_meta/rulebook/INDEX|Rulebook Index]].
