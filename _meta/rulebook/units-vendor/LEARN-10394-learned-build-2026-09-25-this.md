---
type: reference
id: LEARN-10394-learned-build-2026-09-25-this
title: BUILD 2026-09-25: This session put raw GH_PAT and SUPABASE_SERVICE_ROL
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10394 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-25: This session put raw GH_PAT and SUPABASE_SERVICE_ROLE_KEY values into a Bash shell command (env-var assignment) to run merge-pr.mjs --dry-run twice — why: no safer invocation path is documented for merge-pr.mjs from this harness (it requires raw env vars), and a prior BUILD close-out (2026-09-24 23:51:49) already flagged this exact pattern as unsafe/refused elsewhere — fix now in place: none shipped this run; routed to ARCEUS as an instruction_change instead of routing around the concern a second time.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10394 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
