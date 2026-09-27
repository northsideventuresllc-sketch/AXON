---
type: reference
id: R-ERROR-001
title: "Fix an error the first time you see it, same run if possible"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["error handling", "self fix cron", "recurring error", "flag again"]
source: "nvg-operator-core §7 'ERROR HANDLING'"
lives_in:
  - "nvg-operator-core §7 'ERROR HANDLING'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, execution]
---

Fix an error during the same cron/workflow run wherever possible. If it truly can't be fixed in that run, queue it into the standing self-fix cron rather than letting it resurface as a report flag three or four times before anyone fixes it — that resurfacing pattern is explicitly banned.

See [[_meta/rulebook/INDEX|Rulebook Index]].
