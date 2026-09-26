---
type: reference
id: R-VENTURE-NVG-SITE-001
title: "northsideventuresgroup site: one file drives the whole venture list"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [nvg]
  harnesses: [ALL]
triggers: ["ventures.ts", "venture tree", "nvg landing site"]
source: "northsideventuresgroup CLAUDE.md"
lives_in:
  - "northsideventuresgroup CLAUDE.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture]
---

Adding a new company/product to the northsideventuresgroup.com landing page means editing `src/data/ventures.ts` (`VENTURE_TREE`) and dropping a transparent logo in `public/logos/` — no other file needs touching for a new entry.

See [[_meta/rulebook/INDEX|Rulebook Index]].
