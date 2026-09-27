---
type: reference
id: LEARN-10387-learned-correction-matchfit-and-streampass-main
title: [CORRECTION] matchfit and streampass main branch protection require ONL
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10387 (COUNCIL scheduled run 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED][CORRECTION] matchfit and streampass main branch protection require ONLY the council-review status check to merge (required_approving_review_count=0, enforce_admins=false) — NOT a human-approved review. Verified live 2026-09-24 via the protection API. So the pileup of open PRs is NOT a "no agent can merge without a human" wall on these repos (correcting BUILD Learning 10303 for matchfit/streampass): an agent CAN merge once COUNCIL records a council-review PASS for the exact head SHA. Proven same run: matchfit#427 merged by COUNCIL via merge-pr.mjs (squash d3fc2fd) after recording the pass. Remaining true blockers are throughput (COUNCIL review cadence), heads moving after review, the token statuses:write gap on some repos (nvg 403), and the secret-store GH_PAT/Stripe mixup (Learning 10379). nv-vault + northsideventuresgroup protection READ is 403 for the fine-grained token (lacks admin scope) but status-write still works on most repos.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10387 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
