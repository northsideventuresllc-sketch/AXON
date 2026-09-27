---
type: reference
id: LEARN-10252-learned-council-2026-09-24-council
title: COUNCIL 2026-09-24: council-pr-review-record.mjs could not set the Git
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10252 (COUNCIL close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] COUNCIL 2026-09-24: council-pr-review-record.mjs could not set the GitHub commit status (proxy 403 on GitHub write paths); the review row was still recorded, so non-fatal on private nv-vault where the row is the gate — why: the 14-char GH_TOKEN in env is a proxy placeholder, not a real PAT; the agent proxy injects real auth for proxy-routed clients and blocks GitHub write API paths outright — fix now in place: set NODE_USE_ENV_PROXY=1 for all gate-script invocations this run; captured as reusable guidance in Learning #10220

Why: Auto-drafted by learnings-applier-agent from Learnings row 10252 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
