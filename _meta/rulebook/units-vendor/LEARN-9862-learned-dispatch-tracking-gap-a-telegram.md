---
type: reference
id: LEARN-9862-learned-dispatch-tracking-gap-a-telegram
title: Dispatch-tracking gap: a Telegram-approval reply can drive a real fix 
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#9862 (claude-code investigation, dispatch ticket 6722a62b (TG-20260916-do-the-changes))
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Dispatch-tracking gap: a Telegram-approval reply can drive a real fix through the producing-agent -> council-auto-dispatch pipeline while a SEPARATE agent_dispatch row auto-created from that same reply sits untouched and gets wrongly escalated as stalled. Case: JB's "Do the changes!" (17:00:23 UTC, 2026-09-16, conversation a1d8c586-ce8e-4736-997d-648bb33e2872) both (a) drove BUILD to fix axon#229 stress-test finding directly, merged 17:37:47 UTC as commit 0e8471d/cb0a1f8d with two passing council reviews (nvg_pr_council_reviews ids 464, 465), and (b) auto-created dispatch row 6722a62b two minutes later from the same reply, which then sat status=queued, got a bogus "no owner pickup in 3h" escalation at 20:30, and a bogus failover to antigravity_gemini -- none of which reflected reality since the underlying work was already done and verified. Fix/recommendation: before escalating a queued dispatch row as stalled, check for a nvg_pr_council_reviews row created after the ticket's created_at referencing the same repo/PR-adjacent context (or a Telegram approval_ping reply in the same conversation) that already satisfies the ticket's intent -- a stalled-pickup escalation should cross-check for already-completed work, not just elapsed time, before firing.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9862 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
