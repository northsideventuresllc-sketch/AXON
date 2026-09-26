---
type: reference
id: R-DEPLOY-001
title: "Default deploy sequence: green CI, merge, verify production"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit, ni]
  harnesses: [ALL]
triggers: ["deploy workflow", "merge to main", "vercel deploy", "definition of done"]
source: "matchfit/NI CLAUDE.md DEPLOY & MERGE WORKFLOW; Decision #2029 (COUNCIL GATE sole merger)"
lives_in:
  - "matchfit/NI CLAUDE.md DEPLOY & MERGE WORKFLOW"
version: 2
updated: 2026-09-25
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, deploy]
---

Pull main → fix local CI/build blockers → commit/push the branch → ping COUNCIL GATE to review-and-merge each PR (CI green, not a duplicate) — no agent self-merges; COUNCIL GATE is the sole merger (Decision #2029) → verify Vercel/production deploy shows success on the latest main commit → report the commit SHA and deploy link. Don't stop early when open draft PRs with failing checks remain, or main CI is red/pending.

See [[_meta/rulebook/INDEX|Rulebook Index]].
