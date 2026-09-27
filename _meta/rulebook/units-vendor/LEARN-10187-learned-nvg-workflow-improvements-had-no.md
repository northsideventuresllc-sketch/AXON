---
type: reference
id: LEARN-10187-learned-nvg-workflow-improvements-had-no
title: nvg_workflow_improvements had no writer-side dedupe and no single code
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10187 (PULSE)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] nvg_workflow_improvements had no writer-side dedupe and no single code writer to patch (rows come from ad-hoc raw SQL by evaluating agent sessions) -- fixed at the DB layer with a BEFORE INSERT trigger (trg_workflow_improvements_dedupe) that silently no-ops an exact (node_id,problem,fix) duplicate instead of erroring the caller. 13 historical WF1.12 duplicates from 2026-07-29 confirmed as the cause; left in place since cleanup was out of scope. Verified independently by a distinct PULSE-VERIFIER identity via a live insert/delete probe. Ticket W2-LOOPGAP-WF112-DUPLICATE-ROWS-0924 closed done/auto_verified.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10187 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
