---
id: R-LRNB-016
title: Restart the pg_net worker when the outbound HTTP queue stalls
type: reference
priority: should
scope:
  agents: [PULSE, BUILD]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [pg_net, net.http_request_queue, telegram not sending, outbound worker stalled]
source: "Learning #9890"
version: 1
updated: 2026-09-24
status: active
---
Every pg_cron job that calls out over HTTP (Telegram pings, agent fires, mini checks) can
silently stop if NI-Brain's pg_net outbound worker stalls while still showing as alive. If
`net.http_request_queue` has rows older than 5 minutes, or `max(net._http_response.created)`
is over 10 minutes stale, run `select net.worker_restart();` — the queue drains in about a
minute.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
