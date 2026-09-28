---
type: reference
id: LEARN-9858-learned-ticket-duplication-pattern-confirmed-again
title: Ticket-duplication pattern confirmed again on 4947934c-c27c-4da7-987c-
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9858 (unknown)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Ticket-duplication pattern confirmed again on 4947934c-c27c-4da7-987c-84eea1313815: a BUILD backlog row can sit "queued" for weeks (created 2026-08-12) after the exact decision that answers it (#1813, 2026-09-07: no dedicated cloud GPU) already landed and even named-closed the row's direct predecessor ticket (AXON-V0-CLOUD-SERVER-BUILD-0811). Backlog rows do not auto-close when a later Decision answers them -- whoever writes the superseding Decision should also close the matching agent_dispatch row(s) in the same pass, or maintain an explicit backlink, otherwise the same stale ask keeps getting re-dispatched. Separately confirmed while investigating: lib/axon-v1-cloud-relay.mjs (AXON repo) and the matching matchfit/nv-vault chain-notation docs still described RunPod as "not deployed yet"/free as of 2026-09-24 despite being deployed since 2026-08-26/28 and paid since Decision #1813 (2026-09-07) -- a 7-week-stale doc claim that Decision #2001 (same day) then explicitly ordered fixed. Doc-accuracy PRs opened (not merged): AXON #248, matchfit #415, nv-vault #535.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9858 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
