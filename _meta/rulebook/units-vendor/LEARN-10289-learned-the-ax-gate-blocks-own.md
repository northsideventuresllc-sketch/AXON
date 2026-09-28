---
type: reference
id: LEARN-10289-learned-the-ax-gate-blocks-own
title: The AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917 DB-side loopback-inference allo
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#10289 (orchestrator-lane)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] The AX-GATE-BLOCKS-OWN-LOCAL-TIER-0917 DB-side loopback-inference allowlist fix (fn_classify_mini_job_risk, applied live 2026-09-24) had no tracked SQL file and no mirrored update in lib/nvg-mini-risk-gate.mjs, despite that file's own header requiring the two stay in lockstep. Also found the OLD JS allowlist pattern had no end-anchor, so a shell-injection suffix after a recognized curl prefix would have still classified allowlisted/low -- a real (if narrow) gap, not just documentation drift. Fixed in AXON PR #268 (tightened pattern + db/axon-v0/010_mini_risk_gate_loopback_fix.sql). General lesson: when a DB function gate has a documented client-side JS mirror, changing one without the other is a silent drift risk each time it happens, not a one-off.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10289 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
