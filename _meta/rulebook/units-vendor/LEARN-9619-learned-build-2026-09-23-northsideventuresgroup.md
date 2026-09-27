---
type: reference
id: LEARN-9619-learned-build-2026-09-23-northsideventuresgroup
title: BUILD 2026-09-23: northsideventuresgroup.com apex domain serves an exp
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#9619 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-23: northsideventuresgroup.com apex domain serves an expired TLS certificate to visitors — why: The apex domain's DNS is delegated to Wix (ns8/ns9.wixdns.net), not to Vercel, so Vercel cannot complete the ACME renewal challenge for it even though the site itself is hosted on Vercel — fix now in place: Routed to JB via agent_dispatch needs_jb_approval with the exact Wix DNS change needed (point apex A record at Vercel, or redirect apex to www) -- no tool available in this session has Wix DNS write access

Why: Auto-drafted by learnings-applier-agent from Learnings row 9619 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
