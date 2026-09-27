---
type: reference
id: LEARN-10348-correction-2026-09-24-jb-got
title: 2026-09-24 JB got a burst of fake "Needs Your Approval" Telegram ca
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#10348 (claude-code-session)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] 2026-09-24 JB got a burst of fake "Needs Your Approval" Telegram cards for ordinary COUNCIL/BUILD tickets. Root causes: (1) tickets inserted without verification_spec get flipped to needs_context by fn_axon_spec_gate the moment an agent claims them, and fn_telegram_approval_ping pings JB for ANY needs_context row; (2) fn_axon_tier_gate forces needs_jb_approval=true on any risk_tier=major insert, so agent-to-agent tickets tagged major ping JB. Orchestrator session caused some of these by inserting tickets as major with no spec. Fix applied (data only): backfilled a human_only spec on all 110 queued spec-less tickets, replaced 5 rejected specs, and cleared needs_jb_approval on BUILD-AXON-265. Rule: every agent_dispatch insert must carry a valid verification_spec and use risk_tier minor unless JB genuinely must decide. Proposed (needs JB): pinger should skip needs_context rows with needs_jb_approval=false and route them to the owner instead.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10348 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
