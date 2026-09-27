---
type: reference
id: LEARN-9816-correction-webmcp-route-returned-fake-fulfilment
title: WebMCP route returned fake fulfilment (random rf_live token, status
priority: normal
scope:
  agents: ["all"]
  ventures: ["northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#9816 (claude-code-cloud)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] WebMCP route returned fake fulfilment (random rf_live token, status active/confirmed) with no payment and wrote internal test agents into outreach_leads as real leads. Deleted 2 fake leads + 3 test service requests (JB approved). Why: test traffic was run against the prod write path with no test flag.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9816 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
