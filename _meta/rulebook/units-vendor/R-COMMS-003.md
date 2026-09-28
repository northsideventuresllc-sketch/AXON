---
type: reference
id: R-COMMS-003
title: "Pre-send scan before any message reaches JB"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["pre-send", "before sending", "jargon leak", "telegram draft"]
source: "nvg-operator-core §9 'THE PRE-SEND SCAN'"
lives_in:
  - "nvg-operator-core §9 'THE PRE-SEND SCAN'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, comms, adhd]
---

Before any chat reply, Telegram ping, push notification, board doc, or close-out summary reaches JB, re-read the draft once specifically hunting for table/column names, row/record ids, commit hashes, job/trigger codes, SQL, file paths, and words like "row", "heartbeat", "close-out", "NI-Brain", "table", "query", "payload". Any hit: stop and rewrite before sending — never send with a mental note to fix it next time.

Why: this exact leak reached JB and was called a regression, twice before.

See [[_meta/rulebook/INDEX|Rulebook Index]].
