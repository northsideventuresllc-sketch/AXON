---
type: reference
id: LEARN-10817-learned-two-council-gate-cloud-fires
title: Two COUNCIL GATE cloud fires can run concurrently on the same PR queue
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#10817 (COUNCIL GATE)
version: 1
updated: 2026-09-27
status: draft
---

[LEARNED] Two COUNCIL GATE cloud fires can run concurrently on the same PR queue and collide: on 2026-09-26 ~12:40 a scheduled COUNCIL-GATE-IMPROMPTU fire booted while another COUNCIL GATE cloud session was mid-run actively writing nvg_pr_council_reviews rows and merging (AXON #278/#282/#286 merged 12:24-12:37, NI #305 / AXON #260 review rows 12:38-12:41). The second fire's dry-run saw AXON #278 mergeable seconds before the live instance merged it, and nv-vault #522/#512 flipped clean->dirty as main moved underneath. nvg_agent_presence is keyed by agent_name (upsert), so a second same-named session overwrites the one row and CANNOT be detected by a presence row count -- detect concurrency via fresh nvg_pr_council_reviews / merge activity instead. Correct posture for the later fire: STAND DOWN from merging (do not pile a second merger onto the queue -> that manufactures the exact dirty-conflict churn), re-check after an interval, and only take over if the live instance has gone silent mid-queue. This is the live case the still-open single-instance-per-name lock PRs (nv-vault #549/#553) exist to prevent; until one lands, a fired COUNCIL GATE must self-check for a live peer before merging.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10817 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
