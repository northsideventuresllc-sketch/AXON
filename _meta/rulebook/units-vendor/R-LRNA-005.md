---
type: reference
title: "Recompute stated health/compliance numbers live before repeating them"
status: active
updated: 2026-09-24
id: R-LRNA-005
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['boot-guard', 'health']
source: "Learnings #1034, #1150, #1208, #1213, #1418, #1779, #2000, #2723, #2727, #2744, #2831, #2837, #3279, #3290, #3454, #7102, #7103, #7105, #7107, #7108, #7109, #7111, #7114, #7122, #7123, #7126, #7127, #7289, #7291, #7319, #7320, #7587, #7833"
version: 1
---

# Recompute stated health/compliance numbers live before repeating them

A stated compliance or drift percentage must be recomputed live before being repeated — do not carry forward an older ticket's number as current. Detect and close orphaned in-progress task_log rows at boot. A liveness/health-writer fix must survive 3 monitoring cycles before being called permanent. Never claim full backlog clearance from a time-boxed sweep — report the exact count checked vs. the count still remaining.

Source Learning ids (slice A, merged): 1034,1150,1208,1213,1418,1779,2000,2723,2727,2744,2831,2837,3279,3290,3454,7102,7103,7105,7107,7108,7109,7111,7114,7122,7123,7126,7127,7289,7291,7319,7320,7587,7833

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
