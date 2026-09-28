---
type: reference
id: R-BOOT-005
title: "Classify the session and close the loop against the last run first"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["session classification", "loop close", "previous run", "carry forward"]
source: "nvg-operator-core §3 Steps 1-2.5"
lives_in:
  - "nvg-operator-core §3 Steps 1-2.5"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, boot, loop]
---

Classify every session by property, not by hardcoded name lookup, into Repeating Workspace, Rolling Workspace, Cron Job, or One-Off. For Repeating/Rolling types, query `session_notes_apartment`/Decisions/Learnings for the previous run's open items BEFORE starting new work, and state plainly what's carried forward vs. now closed.

See [[_meta/rulebook/INDEX|Rulebook Index]].
