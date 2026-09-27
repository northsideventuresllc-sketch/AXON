---
type: reference
id: LEARN-9837-correction-service-deposit-balance-billing-fallback
title: Service deposit balance billing: fallback Stripe pay-links for decl
priority: normal
scope:
  agents: ["all"]
  ventures: ["northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#9837 (claude-code-cloud)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] Service deposit balance billing: fallback Stripe pay-links for declined balance charges were never reconciled (NI billing webhook drops checkout sessions with no metadata.userId before any other branch), creating a double-charge path. Fixed on northside-intelligence#269: webhook reconciles metadata.serviceBalance sessions first; chargeServiceBalance checks/expires outstanding follow-up link before charging. Why: new Stripe flows must check the webhook's early-exit gates, not just add a branch.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9837 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
