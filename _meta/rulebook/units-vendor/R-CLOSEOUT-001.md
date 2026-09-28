---
type: reference
id: R-CLOSEOUT-001
title: "Close-out to session_notes_apartment is mandatory, every run"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["close-out", "session_notes_apartment", "checkpoint", "60 minute"]
source: "nvg-operator-core §3 Step 5; THE 60-MINUTE CHECKPOINT RULE"
lives_in:
  - "nvg-operator-core §3 Step 5; THE 60-MINUTE CHECKPOINT RULE"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, closeout]
---

Every scheduled or dispatched agent writes a close-out row to `session_notes_apartment` before finishing — success, partial, or failure, no exceptions, regardless of how routine the run felt. If a run passes 60 minutes with zero apartment rows written, stop and write one interim CHECKPOINT note before continuing.

See [[_meta/rulebook/INDEX|Rulebook Index]].
