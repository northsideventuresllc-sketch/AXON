---
type: reference
title: "Self-healing systems must declare blast radius and record provenance"
status: active
updated: 2026-09-24
id: R-LRNA-008
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['systems', 'engineering']
source: "Learnings #2318, #2328, #2337, #2339, #2340, #2341, #2343, #2345, #2346, #2350, #2359, #2360, #2737, #7161, #7248"
version: 1
---

# Self-healing systems must declare blast radius and record provenance

Every kill switch must declare its blast radius before being flipped — a correct cost fix can silently become a total outage. Self-healing scripts must record true provenance and never fabricate a dry_run/source value. Append-only logging that never updates the routing files telling the next agent where to look is not organized memory — a memory system must close its own loop, not just grow.

Source Learning ids (slice A, merged): 2318,2328,2337,2339,2340,2341,2343,2345,2346,2350,2359,2360,2737,7161,7248

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
