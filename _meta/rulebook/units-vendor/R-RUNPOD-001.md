---
type: reference
id: R-RUNPOD-001
title: "RunPod AXON tier is skip-automatically while unfunded, never called free"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [axon]
  harnesses: [ALL]
triggers: ["runpod", "axon chain", "gpu hosting", "runpod free"]
source: "Decision #2001"
lives_in:
  - "Decision #2001"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, venture, ai-vault]
---

The RunPod tier in the AXON model chain must be skipped automatically while it keeps failing (currently ~0% success from a negative client balance, not "not deployed") — no spend, no funding until JB acts. Correct every rule line still calling RunPod "free"; it is a paid pay-per-use endpoint that is currently off, not a free tier.

See [[_meta/rulebook/INDEX|Rulebook Index]].
