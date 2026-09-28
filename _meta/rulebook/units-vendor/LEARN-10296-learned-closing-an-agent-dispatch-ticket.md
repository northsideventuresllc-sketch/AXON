---
type: reference
id: LEARN-10296-learned-closing-an-agent-dispatch-ticket
title: Closing an agent_dispatch ticket that the spec-gate bounced to needs_c
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#10296 (claude-code-session)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Closing an agent_dispatch ticket that the spec-gate bounced to needs_context: call fn_axon_verify_dispatch first (sets auto_verified), THEN a plain update status=done sticks. Setting status before verification always reverts. Proven on SEC-NI-NEXT16-UPGRADE-0924 (NI PR #292).

Why: Auto-drafted by learnings-applier-agent from Learnings row 10296 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
