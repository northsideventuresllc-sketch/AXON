---
type: reference
id: R-SKILLPTR-LOOP-ENGINEERING
title: "Invoke loop-engineering to promote apartment notes into the real brain"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["loop engineering", "promote apartment notes", "session close"]
source: "golden skill loop-engineering"
lives_in:
  - "nv-vault .claude/skills/loop-engineering/SKILL.md"
  - "referenced by nvg-operator-core §3 Step 5"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:loop-engineering
tags: [rulebook, should, skill-pointer]
---

`loop-engineering` reads `session_notes_apartment` (raw close-out notes) and decides what's durable enough to promote into Decisions/Learnings/Context and the real vault docs — it's the messenger between raw session notes and the structured brain, run at session close.

See [[_meta/rulebook/INDEX|Rulebook Index]].
