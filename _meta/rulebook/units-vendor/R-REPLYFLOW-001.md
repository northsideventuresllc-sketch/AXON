---
type: reference
id: R-REPLYFLOW-001
title: "ReplyFlow changes need JB sign-off before merging to main"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ni]
  harnesses: [ALL]
triggers: ["replyflow", "sub-tree rule", "wait for approval"]
source: "northside-intelligence AGENTS.md 'SECTOR 3 SUB-REPO RULES DIFFER'"
lives_in:
  - "northside-intelligence AGENTS.md 'SECTOR 3 SUB-REPO RULES DIFFER'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture, authority]
---

Changes under the ReplyFlow paths (`src/app/replyflow`, `src/app/api/replyflow`, `src/components/replyflow`, `src/lib/replyflow`, `src/lib/billing/replyflow-access.ts`) in northside-intelligence wait for JB's explicit go-ahead before merging to main — stricter than the repo's default standing merge approval.

See [[_meta/rulebook/INDEX|Rulebook Index]].
