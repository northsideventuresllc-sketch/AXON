---
type: reference
id: LEARN-9549-learned-exec-2026-09-23-northsideventuresgroup
title: EXEC 2026-09-23: northsideventuresgroup.com apex (bare domain) serves 
priority: normal
scope:
  agents: ["all"]
  ventures: ["exec"]
  harnesses: ["all"]
triggers: []
source: Learnings#9549 (EXEC close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] EXEC 2026-09-23: northsideventuresgroup.com apex (bare domain) serves an EXPIRED TLS cert; www version works fine — why: Apex DNS likely not pointed at Vercel, or a stale cert on the apex host — the managed cert is not being renewed for the bare domain while www renews normally — fix now in place: Filed NVG-APEX-CERT-EXPIRED-0923 to BUILD with a verified diagnosis and candidate fix (point apex A/ALIAS at Vercel and re-issue cert, or redirect apex to www)

Why: Auto-drafted by learnings-applier-agent from Learnings row 9549 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
