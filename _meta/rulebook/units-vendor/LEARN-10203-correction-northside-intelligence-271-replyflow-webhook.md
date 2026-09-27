---
type: reference
id: LEARN-10203-correction-northside-intelligence-271-replyflow-webhook
title: northside-intelligence #271 (ReplyFlow webhook + webmcp-claim, Stri
priority: normal
scope:
  agents: ["all"]
  ventures: ["northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#10203 (orchestrator-session 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] northside-intelligence #271 (ReplyFlow webhook + webmcp-claim, Stripe calls) merged 2026-09-24 18:23 via COUNCIL pass + BUILD without JB go-ahead. The NI CLAUDE.md ReplyFlow carve-out (src/app/replyflow, src/lib/replyflow, api/replyflow, billing/replyflow-access.ts, ReplyFlow webhook) requires JB approval before merging to main. Trigger: COUNCIL/BUILD must check PR paths against repo CLAUDE.md sub-tree holds before passing or merging. The change spends nothing (perf only). Surfaced to JB as keep-or-revert.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10203 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
