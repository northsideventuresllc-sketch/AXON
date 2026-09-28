---
type: reference
title: "Sanitize internal identifiers out of JB-facing messages"
status: active
updated: 2026-09-24
id: R-LRNA-014
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['telegram', 'comm-mode']
source: "Learnings #876, #1006, #1147, #1592, #1593, #1613, #3567, #3568, #7389, #7435"
version: 1
---

# Sanitize internal identifiers out of JB-facing messages

Any JB-facing Telegram or report message must strip or reject internal job codes (AX-*), PR numbers, and dry_run flags before sending — never echo "Job: CODE" alongside a plain title. Keep operator-facing text in plain English; internal identifiers stay in the linked doc or dispatch row, not the message body.

Source Learning ids (slice A, merged): 876,1006,1147,1592,1593,1613,3567,3568,7389,7435

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
