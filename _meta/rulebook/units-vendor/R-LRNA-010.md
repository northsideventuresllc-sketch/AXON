---
type: reference
title: "Platform posting mechanics to check before troubleshooting"
status: active
updated: 2026-09-24
id: R-LRNA-010
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['media', 'content', 'publishing']
source: "Learnings #536, #982, #983, #1166, #2491, #2493, #2502, #2504, #2507, #2508, #2516, #2518, #2519, #2529, #2770, #3254, #6995, #7227, #7701"
version: 1
---

# Platform posting mechanics to check before troubleshooting

TikTok web cannot create a photo carousel (confirmed against their own JS bundle — no PHOTO_POST enum). Meta Business Suite Composer requires the caption typed BEFORE attaching media, with real keystrokes, not paste. Instagram/TikTok page fetches are CSP-blocked at the tool layer — read via screenshot, never propose a scraper or mirror route.

Source Learning ids (slice A, merged): 536,982,983,1166,2491,2493,2502,2504,2507,2508,2516,2518,2519,2529,2770,3254,6995,7227,7701

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
