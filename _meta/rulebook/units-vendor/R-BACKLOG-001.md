---
type: reference
id: R-BACKLOG-001
title: "Clear the full owned backlog before normal duties, every scheduled run"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["backlog", "queue throughput", "needs_context", "partial pickup"]
source: "nvg-operator-core §7 'Every scheduled agent clears its FULL owned backlog'"
lives_in:
  - "nvg-operator-core §7 'Every scheduled agent clears its FULL owned backlog'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, execution, queue]
---

Partial pickup of a queue (2-3 items when many more are open) is a failed run, not acceptable throughput. Check the backlog count fresh each run rather than restamping an old "it's fine" — a valid `human_only` item sitting untouched for weeks is still a gap worth surfacing, not a reason to skip it silently.

See [[_meta/rulebook/INDEX|Rulebook Index]].
