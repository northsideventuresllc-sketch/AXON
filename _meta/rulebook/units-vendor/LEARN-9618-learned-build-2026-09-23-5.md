---
type: reference
id: LEARN-9618-learned-build-2026-09-23-5
title: BUILD 2026-09-23: 5 SECURITY DEFINER database functions (3 of them AXO
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#9618 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-23: 5 SECURITY DEFINER database functions (3 of them AXON morality vote/veto/ratify) were callable by anyone with just the public anon API key, no login required — why: PostgreSQL grants EXECUTE to the PUBLIC pseudo-role by default when a function is created; REVOKE on anon/authenticated alone does not remove it because anon/authenticated still inherit PUBLIC's grant — fix now in place: REVOKE EXECUTE ... FROM PUBLIC (in addition to anon/authenticated) on all 5 functions, then GRANT EXECUTE to service_role only

Why: Auto-drafted by learnings-applier-agent from Learnings row 9618 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
