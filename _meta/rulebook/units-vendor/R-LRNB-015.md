---
id: R-LRNB-015
title: Fire an agent server-side when the session can't hold its credentials
type: reference
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code, cloud_session]
triggers: [fire agent, blocked from credentials, sandbox secret, fire_trigger blocked]
source: "Learning #9891"
version: 1
updated: 2026-09-24
status: active
---
A session blocked from materializing a secret can still fire an agent: run the same liveness
checks fire-agent.mjs does (routine active, not retired/merged, key not stale) then call
`net.http_post` from SQL reading fire_url/api_key from `ni_platform_secrets` server-side —
no secret ever touches the session's own environment.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
