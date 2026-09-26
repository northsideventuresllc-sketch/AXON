---
type: reference
title: "AXON memory and product architecture standing facts"
status: active
updated: 2026-09-24
id: R-LRNA-007
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['axon', 'architecture']
source: "Learnings #942, #945, #1030, #1692, #2255, #2256, #2257, #2258, #2503, #2690, #2922, #3319, #3448, #4245, #4246, #4366, #7659"
version: 1
---

# AXON memory and product architecture standing facts

Memory-bearing systems use LIVE reads, never snapshots, with permanent self-organizing memory — corrections stick forever; never propose decay, TTL, eviction or pruning for AXON memory. The AXON brain (not the tools) is the paid recurring asset; every AXON tool ships a DEFAULT LAYER the owner then customizes. Admin↔AXON congruence requires the sync outbox to live in the SAME database as the domain row it tracks.

Source Learning ids (slice A, merged): 942,945,1030,1692,2255,2256,2257,2258,2503,2690,2922,3319,3448,4245,4246,4366,7659

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
