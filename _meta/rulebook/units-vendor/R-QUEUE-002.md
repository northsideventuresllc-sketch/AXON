---
type: reference
id: R-QUEUE-002
title: "Ambiguous now-vs-queue: ask JB immediately, never silently default to queue"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["queue vs fire", "ambiguous", "now or later", "risk bearing work"]
source: "nvg-operator-core §7A"
lives_in:
  - "nvg-operator-core §7A"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, execution, queue]
---

When it's genuinely unclear whether work needs to happen now or can wait for the normal queue, check the two brains first — if that doesn't resolve it, ask JB immediately (live chat or a Telegram NEEDS APPROVAL ping). Clear risk-bearing work still fires immediately regardless; this only closes the ambiguous middle that previously defaulted to queued by omission.

See [[_meta/rulebook/INDEX|Rulebook Index]].
