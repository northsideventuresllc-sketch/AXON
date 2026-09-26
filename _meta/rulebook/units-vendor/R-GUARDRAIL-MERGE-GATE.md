---
type: reference
id: R-GUARDRAIL-MERGE-GATE
title: "Merge gate — scripts/merge-pr.mjs requires a passing council review row"
priority: should
kind: guardrail
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["merge gate", "merge-pr.mjs", "nvg_pr_council_reviews", "council review record"]
source: "nvg-operator-core §3A step 6; w2-common.md review ticket instructions; Decision #2029 (COUNCIL GATE sole merger)"
lives_in:
  - "nv-vault scripts/merge-pr.mjs"
  - "nv-vault scripts/council-pr-review-record.mjs"
  - "DB table: nvg_pr_council_reviews"
version: 2
updated: 2026-09-25
superseded_by: 
owner: script:merge-pr.mjs
tags: [rulebook, should, guardrail, merge]
---

A merge to main only happens through `scripts/merge-pr.mjs`, run by COUNCIL GATE (the sole merge/deploy authority, Decision #2029), which requires a passing `nvg_pr_council_reviews` row recorded for the exact head SHA (via `scripts/council-pr-review-record.mjs`) before it will merge — conflicts get resolved by COUNCIL subagents, never a manual force-merge around the script.

See [[_meta/rulebook/INDEX|Rulebook Index]].
