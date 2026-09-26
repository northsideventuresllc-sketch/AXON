---
type: reference
id: R-PIPELINE-001
title: "Every non-trivial task runs the full execution pipeline"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["task pipeline", "execution pipeline", "plan approval", "non-trivial task"]
source: "nvg-operator-core §3A; Decision #1587"
lives_in:
  - "nvg-operator-core §3A; Decision #1587"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, pipeline]
---

Context (two brains first) → goal + done written down → plan in plain English, approved by COUNCIL or JB → execute with graph engineering by default → council review + stress test → ship only via `scripts/merge-pr.mjs` → report plain English → close (presence, session_notes_apartment, write-back, one close line). Skipping a step is a failed run.

See [[_meta/rulebook/INDEX|Rulebook Index]].
