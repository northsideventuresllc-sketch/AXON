---
type: reference
id: LEARN-10234-learned-arceus-2026-09-24-fn
title: ARCEUS 2026-09-24: fn_axon_verify_dispatch rejected status done and ev
priority: normal
scope:
  agents: ["all"]
  ventures: ["arceus"]
  harnesses: ["all"]
triggers: []
source: Learnings#10234 (ARCEUS close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] ARCEUS 2026-09-24: fn_axon_verify_dispatch rejected status done and evidence-with-only-exit-code — why: fn_axon_verify_dispatch only sets auto_verified/human_verified and requires a positive artifact key in evidence, by design to stop exit-code-only proofs — fix now in place: Record verification with status auto_verified and evidence carrying pr_url/commit_sha/path/test_result, never an exit code alone

Why: Auto-drafted by learnings-applier-agent from Learnings row 10234 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
