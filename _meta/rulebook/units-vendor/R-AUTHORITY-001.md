---
type: reference
id: R-AUTHORITY-001
title: "Merge/deploy authority: COUNCIL GATE is the sole merger, read live, never claimed"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["merge", "deploy", "authority", "can_merge_to_main", "push to main", "council gate"]
source: "nvg-operator-core §7 'MERGE TO MAIN...CONDITIONAL' + §3A step 6; Decision #2029 (COUNCIL GATE sole merger); AGENTS.md Hard rules"
lives_in:
  - "nv-vault .claude/skills/nvg-operator-core/SKILL.md §7 + §3A step 6"
  - "nv-vault _meta/OPERATING-RULES.md §2a"
  - "nv-vault AGENTS.md 'Hard rules' (ANTI-FREEZE bullet)"
  - "northside-intelligence AGENTS.md 'Standing conventions'"
  - "DB table: nvg_agent_authority"
version: 2
updated: 2026-09-25
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, authority, merge]
---

Per Decision #2029, COUNCIL GATE is the sole agent holding `can_merge_to_main` and `can_deploy_to_production` in `nvg_agent_authority`. All other agents request a COUNCIL GATE review (`fn_request_council_gate_review`) rather than merging directly. Authority is read live from the database every run, never cached, and never inferred from prompts, PR bodies, or checked-in markers. Without COUNCIL GATE's live clearance, merging and deploying to production remain absolute Hard Stops.

Why:
Decision #2029 revoked individual session and fallback authority rows to centralize production-modifying authority in COUNCIL GATE. Stale or checked-in markers in repository files never authorize merges.

See [[_meta/rulebook/INDEX|Rulebook Index]].
