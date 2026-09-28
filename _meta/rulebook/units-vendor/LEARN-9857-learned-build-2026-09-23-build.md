---
type: reference
id: LEARN-9857-learned-build-2026-09-23-build
title: BUILD 2026-09-23 (BUILD-PIPELINE-FOLLOWTHROUGH-AUDIT-0923): the Stop h
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#9857 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-23 (BUILD-PIPELINE-FOLLOWTHROUGH-AUDIT-0923): the Stop hook's close-out gate (nvg-stop-gate.mjs) checked marker freshness by time only (last 12h), not by session -- any session sharing a project directory could end without running its own close-out because an unrelated earlier session's marker still looked fresh. Fixed: nvg-close.mjs now stamps the marker with the session id that wrote it, nvg-stop-gate.mjs only trusts a fresh marker as the current session's own close-out when both ids are known and match (falls back to the old time-only check otherwise, so it never blocks harder than before). Shipped nv-vault PR #534 (commit d42b3c70) with 6 new tests, all green. Two other real causes found but not fixed here (separate, larger scope): EXEC has twice abandoned its own structured step-by-step flow mid-run for side-work instead of finishing the flow first (Learnings #9143/#9144); several Task Execution Pipeline steps are still prose an agent must remember rather than something mechanically gated the way the close-out step now more reliably is.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9857 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
