---
id: R-LRNB-004
title: Backend/infra security decisions act, don't wait on JB
type: reference
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [security decision, revoke, anon role, SECURITY DEFINER, infra security]
source: "Decision #748, Learning #8891"
version: 1
updated: 2026-09-24
status: active
---
For backend/infrastructure security decisions (e.g. revoking anon/authenticated execute on a
SECURITY DEFINER function), investigate then decide and execute without waiting on JB — ask
only when it is a real product/business tradeoff, not a pure security hardening call. This is
a scoped carve-out of the general Hard Stop list, not a repeal of it.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
