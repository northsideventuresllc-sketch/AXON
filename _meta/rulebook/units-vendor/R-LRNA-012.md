---
type: reference
title: "Verify metric counts with an accurate scan, not a naive grep"
status: active
updated: 2026-09-24
id: R-LRNA-012
priority: nice
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['engineering', 'performance']
source: "Learnings #3297, #3368, #4280, #7274, #7278, #7582, #7647"
version: 1
---

# Verify metric counts with an accurate scan, not a naive grep

A naive grep count is not the real number for a query-per-loop, bug-count, or scope estimate — verify with a brace-accurate or AST-level scan before reporting it. State the verification method used alongside any metric claim, not just the number.

Source Learning ids (slice A, merged): 3297,3368,4280,7274,7278,7582,7647

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
