---
type: reference
id: R-WORKFLOW-WF4
title: "WF4 — NI outreach: 7-step sequence, 2-hourly reply scan"
priority: should
kind: workflow-step
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ni]
  harnesses: [ALL]
triggers: ["ni outreach", "wf4", "7 steps", "reply scan"]
source: "v_boot preflight step 1; nvg-four-workflows SKILL.md"
lives_in:
  - "DB table: nvg_workflow_nodes (WF4)"
  - "nv-vault .claude/skills/nvg-four-workflows/SKILL.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: workflow:WF4
tags: [rulebook, should, workflow, venture]
---

Northside Intelligence outreach (DM + email) follows the locked 7-step WF4 sequence, including the 2-hourly reply scan cadence. Approve-only (R-APPROVAL-001) applies identically to NI outreach as to Match Fit's. Read `nvg_workflow_nodes` (WF4) before touching an NI outreach task.

See [[_meta/rulebook/INDEX|Rulebook Index]].
