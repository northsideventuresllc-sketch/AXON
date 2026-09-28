---
type: reference
id: R-COMPACT-001
title: "On a compaction-resume message, re-check the raw transcript before answering"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["compaction", "resume", "continued from previous conversation", "lossy summary"]
source: "nvg-operator-core §4e"
lives_in:
  - "nvg-operator-core §4e"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, proof]
---

When a turn opens with "This session is being continued from a previous conversation that ran out of context", that IS the signal. Before repeating any specific number, list, or wording from before that point, grep/read the raw transcript file the resume message names — the summary is lossy, and this check is cheap.

See [[_meta/rulebook/INDEX|Rulebook Index]].
