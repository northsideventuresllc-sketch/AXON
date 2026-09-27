---
type: reference
id: LEARN-9980-learned-content-2026-09-24-ni
title: CONTENT 2026-09-24: NI content approval pipeline has been stalled sinc
priority: normal
scope:
  agents: ["all"]
  ventures: ["content"]
  harnesses: ["all"]
triggers: []
source: Learnings#9980 (CONTENT close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] CONTENT 2026-09-24: NI content approval pipeline has been stalled since 2026-09-16 — nothing has moved past pending_approval, and nothing has published on the NI side since 2026-09-08, despite ni.marketing being enabled — why: No agent or JB session has cleared content_machine_posts pending_approval rows in over a week, so Step 2 of the 5-Step Content Workflow (JB review/approve checkpoint) has not been happening on the NI side and drafts keep accumulating with no decision made — fix now in place: Did not auto-flush or auto-refill the NI queue this run (that would mutate 18 live draft rows unreviewed) — escalated the full backlog to JB via PushNotification so clearing it, or explicitly authorizing an unattended agent to auto-archive stale drafts, is a human decision

Why: Auto-drafted by learnings-applier-agent from Learnings row 9980 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
