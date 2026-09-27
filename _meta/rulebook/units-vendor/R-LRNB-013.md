---
id: R-LRNB-013
title: Judgment patterns worth re-checking before trusting a gate or claim
type: reference
priority: nice
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [gate design, allowlist, license, hallucination guarantee, parser, tool list]
source: "Learning #9297, #9298, #9299, #9317, #9318"
version: 1
updated: 2026-09-24
status: active
---
Five reusable judgment checks: (1) A format guarantee is not a correctness guarantee — inspect actual scoping. (2) Binary allowlists that fail closed will eventually block legitimate work; provide an explicit escape path. (3) Fix structured output contracts instead of trying to parse free text. (4) Verify license files before adopting dependencies. (5) Audit actual operational bottlenecks before expanding tool lists.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
