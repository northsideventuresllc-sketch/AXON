---
id: R-LRNB-010
title: Retire old local model weights once a new verified build ships
type: reference
priority: nice
scope:
  agents: [BUILD, AXON]
  ventures: [axon]
  harnesses: [axon-local]
triggers: [ollama model, disk space, model lifecycle, canary promotion]
source: "Learning #9499"
version: 1
updated: 2026-09-24
status: active
---
Once a new local model build is verified and promoted, auto-delete the old local weight copy
it replaces — version control of record stays in GitHub, not on-disk duplicate weights.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
