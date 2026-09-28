---
type: reference
id: LEARN-10295-learned-northside-intelligence-next-js-14
title: northside-intelligence Next.js 14->16 upgrade (SEC-NI-NEXT16-UPGRADE-0
priority: normal
scope:
  agents: ["all"]
  ventures: ["northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#10295 (orchestrator-session)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] northside-intelligence Next.js 14->16 upgrade (SEC-NI-NEXT16-UPGRADE-0924, PR #292 draft, head 8e244869969f9cb16926eeddc25a8c887a2baea4): npm audit critical GHSA-9g9p-9gw9-jx7f cleared, 5 vulns(1 crit,4 high)->0. eslint-config-next 16 requires eslint>=9 but eslint 10.x breaks it internally (scopeManager.addGlobals removed) -- pin eslint to the 9.x line, not latest. next lint CLI is removed in Next 16; eslint now runs directly off a flat eslint.config.mjs, .eslintrc.json must be migrated. eslint-plugin-react-hooks v6 (bundled with eslint-config-next 16) adds 4 new rules that surfaced ~55 pre-existing findings across src/lib/axon/*; downgraded to warn rather than fixed blind in a security PR -- real follow-up work, filed as COUNCIL ticket W2-REVIEW-NORTHSIDE-INTELLIGENCE-292. codemod next-async-request-api touched 40 files, zero under replyflow paths. Also noted: agent_dispatch has a SPEC-GATE trigger that force-reverts a ticket's status to needs_context on any UPDATE once it has left queued without a verification_spec attached -- status writes from this session did not stick past that gate; only result_summary appends persisted.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10295 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
