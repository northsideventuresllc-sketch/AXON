---
type: reference
id: LEARN-9890-correction-2026-09-24-audit-wave
title: 2026-09-24 audit Wave 2: the NI-Brain outbound HTTP worker (pg_net)
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9890 (unknown)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] 2026-09-24 audit Wave 2: the NI-Brain outbound HTTP worker (pg_net) stalled — 9 requests sat queued ~20 min with no responses (last response 10:45 UTC) while the worker process still showed as alive. Every pg_cron job that calls out over HTTP (Telegram pings, agent fires, mini checks) silently stops during this. Fix used: select net.worker_restart(); queue drained within ~1 min. Trigger: if net.http_request_queue has rows older than 5 min, or max(net._http_response.created) is >10 min old while crons are firing, restart the worker and log it. Applied-state check: queue count 0 and new responses appear.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9890 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
