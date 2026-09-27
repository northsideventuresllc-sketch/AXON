---
type: reference
id: LEARN-10430-stale-prompt-ticket-permanent-board-swimschool
title: Ticket PERMANENT-BOARD-SWIMSCHOOL-GATE-SENTINEL-FALSE-CLOSE-0920 
priority: normal
scope:
  agents: ["all"]
  ventures: ["northstarswimschool"]
  harnesses: ["all"]
triggers: []
source: Learnings#10430 (ARCEUS run 2026-09-25; git ls-files northstarswimschool .claude/, PRs #5/#6)
version: 1
updated: 2026-09-26
status: draft
---

[STALE-PROMPT] Ticket PERMANENT-BOARD-SWIMSCHOOL-GATE-SENTINEL-FALSE-CLOSE-0920 claimed northstarswimschool has "no PROOF OF GATE paragraph, no .nvg folder at all" and needs a JB manual sync. Verified live 2026-09-25 against the actual repo: the safety-gate files ARE committed — .claude/hooks/nvg-boot-contract.sh + nvg-close.mjs + nvg-stop-gate.mjs + settings.json (added by PRs #5 and #6, "sync PROOF OF GATE sentinel from nv-vault"), and CLAUDE.md carries the PROOF OF GATE paragraph. The ticket conflated "files missing from the repo" (false) with "gates do not fire in a fired session rooted at /home/user" (true, but that is ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908 scope, a launch-config issue, not a missing-file issue). No JB ping needed. Lesson: verify a "still missing" board item against the actual repo tree before escalating to JB — a fired session rooted at /home/user sees no repo hooks and can produce a false "missing" reading.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10430 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
