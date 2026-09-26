---
id: R-LRNB-006
title: Operator-waiting routines hold the turn, then close at 3am fallback
type: reference
priority: should
scope:
  agents: [EXEC, CONTENT, OUTREACH]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [operator waiting, close-out, EXEC routine, session timeout]
source: "Learning #9074"
version: 1
updated: 2026-09-24
status: active
---
EXEC, CONTENT and OUTREACH keep an active conversational turn open rather than running an
early close-out while waiting on the operator. If nothing arrives, use a 3:00 AM next-day
timeout fallback to close cleanly and capture the inactivity context, instead of closing out
prematurely mid-wait.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
