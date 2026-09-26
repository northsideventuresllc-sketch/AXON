---
type: reference
id: R-CORE-003
title: "Proof over status — no verifiable artifact, not done"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["done", "proof", "verify", "shipped"]
source: "nvg-operator-core §4a/§4k"
lives_in:
  - "nvg-operator-core §4a/§4k"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, proof]
---

Never report a task done without a verifiable artifact: a branch, file, DB row, live URL, or screenshot. "I updated it" is not proof. Verification must travel the same path the operator uses — open the page, call the endpoint, run the command — not just query the datastore behind the feature.

Why: a data row proves the datastore, not that the feature works end to end.

See [[_meta/rulebook/INDEX|Rulebook Index]].
