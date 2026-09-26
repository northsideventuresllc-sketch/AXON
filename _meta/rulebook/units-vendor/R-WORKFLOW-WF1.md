---
type: reference
id: R-WORKFLOW-WF1
title: "WF1 — Match Fit marketing: read the 18-step workflow before touching content"
priority: should
kind: workflow-step
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit]
  harnesses: [ALL]
triggers: ["match fit marketing", "wf1", "18 steps", "posting order"]
source: "v_boot preflight step 1; matchfit-marketing-workflow SKILL.md"
lives_in:
  - "DB table: nvg_workflow_nodes (WF1)"
  - "nv-vault .claude/skills/matchfit-marketing-workflow/SKILL.md"
  - "nv-vault .claude/skills/nvg-four-workflows/SKILL.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: workflow:WF1
tags: [rulebook, should, workflow, venture]
---

Match Fit social content generation, media production, cropping, upload, and posting order (Facebook → Threads → Instagram → TikTok, all Mac mini Chrome) follows the locked 18-step WF1 workflow verbatim — read `nvg_workflow_nodes` (WF1) and the matchfit-marketing-workflow skill before improvising any step. Never invent a step that's already written down.

See [[_meta/rulebook/INDEX|Rulebook Index]].
