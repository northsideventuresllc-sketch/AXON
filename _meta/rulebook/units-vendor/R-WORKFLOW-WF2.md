---
type: reference
id: R-WORKFLOW-WF2
title: "WF2 — Match Fit outreach: 7-step sequence, per lead, approve-only"
priority: should
kind: workflow-step
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit]
  harnesses: [ALL]
triggers: ["match fit outreach", "wf2", "7 steps", "dm sequence"]
source: "v_boot preflight step 1; nvg-four-workflows SKILL.md"
lives_in:
  - "DB table: nvg_workflow_nodes (WF2)"
  - "nv-vault .claude/skills/nvg-four-workflows/SKILL.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: workflow:WF2
tags: [rulebook, should, workflow, venture]
---

Match Fit outreach (DM + email) follows the locked 7-step WF2 sequence per lead — nationwide, virtual-only coaches (R-VENTURE-MF-001), no fabricated leads (R-VENTURE-MF-004), nothing sends without JB's approve tap (R-APPROVAL-001). Read `nvg_workflow_nodes` (WF2) before touching an outreach task.

See [[_meta/rulebook/INDEX|Rulebook Index]].
