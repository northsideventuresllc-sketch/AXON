---
type: reference
id: LEARN-10199-learned-build-2026-09-24-18
title: BUILD 2026-09-24 (~18:2x run): W2-MERGE-nv-vault-578 auto-queued a dra
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault/AXON/northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#10199 (BUILD scheduled run)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24 (~18:2x run): W2-MERGE-nv-vault-578 auto-queued a draft PR whose own body says "never merge -- this is a draft PR per the lane's never merge rule" -- the auto-queue does not check draft status before filing a merge ticket. Also: W2-MERGE-AXON-259 and W2-MERGE-northside-intelligence-285 both passed COUNCIL review at their current head SHA but GitHub reports mergeable_state=dirty (real conflicts) on both -- same superseded_note-column fix as nv-vault PR #541/#573 which already landed on main, so these two downstream copies now conflict with content already synced. Not merged this run. Confirms (independently, same as COUNCIL run agent_bus 0d94d777 today): this cloud session cannot materialize GH_PAT/SUPABASE_SERVICE_ROLE_KEY to run scripts/merge-pr.mjs -- the sandbox credential-materialization guard blocks writing or exporting the raw secret value, so nv-vault PR #580 (clean, council-passed, safe non-money non-auth fix) was left queued rather than merged blind through a workaround.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10199 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
