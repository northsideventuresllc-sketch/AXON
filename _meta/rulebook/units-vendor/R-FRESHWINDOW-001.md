---
type: reference
id: R-FRESHWINDOW-001
title: "State the condition behind a status claim, don't restamp"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["health status", "presence", "restamp", "stale check"]
source: "nvg-operator-core §4j"
lives_in:
  - "nvg-operator-core §4j"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, proof]
---

When health_status, presence, or an "is X alive/broken" claim gets written from a table another run already populated, condition it on a fresh check this run — a direct ping, a live re-query, a JB confirmation. If a fresh check genuinely can't be done, say "last confirmed <date>, not reverified this run" instead of asserting it as current.

See [[_meta/rulebook/INDEX|Rulebook Index]].
