---
type: reference
id: R-CONFLICT-RUNPOD-001
title: "Conflict: RunPod described as "free" in older repo copies"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [axon, match_fit]
  harnesses: [ALL]
triggers: ["runpod free", "conflict", "ai vault order"]
source: "Decision #2001 vs matchfit/AXON repo wording as-read 2026-09-24"
lives_in:
  - "Decision #2001 vs matchfit/AXON repo wording as-read 2026-09-24"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, conflict]
---

RunPod AXON v1 is a paid pay-per-use serverless endpoint, currently ~0% success from a negative client balance — not free, not undeployed. Decision #2001 (2026-09-24) corrects this, but matchfit CLAUDE.md's AI Vault provider-order table and AXON's own repo docs, as read this session, still label it "free" in at least one place each. This unit (R-RUNPOD-001) carries the corrected wording; the stale copies need a direct file fix, not just this unit's existence.
**conflict:** matchfit CLAUDE.md 'AI VAULT DEFAULT' point 2 and AXON repo docs both still call RunPod a free tier in places; Decision #2001 says never call it free. COUNCIL: confirm which repo copies still need the direct text fix (not just this rulebook unit) and dispatch it.


See [[_meta/rulebook/INDEX|Rulebook Index]].
