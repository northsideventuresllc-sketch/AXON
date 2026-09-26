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
Five reusable checks: (1) a "correctness guarantee" that is really only a format guarantee is
the most convincing wrong answer available — read the scoping note, not the headline claim.
(2) A binary allowlist whose fallback is a hard block will eventually block something
legitimate — prefer answer + confidence + an explicit "none of the above" path. (3) When a
pipeline parses free text for a decision, the parser is the failure mode — fix the output
contract, not the prompt. (4) "Open source" is a badge, not a permission — read the LICENSE
file before building on a dependency, not after. (5) A tool list answers "what could we add";
check what is actually the bottleneck before adding to it.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
