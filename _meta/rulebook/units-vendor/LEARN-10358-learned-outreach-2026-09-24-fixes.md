---
type: reference
id: LEARN-10358-learned-outreach-2026-09-24-fixes
title: OUTREACH 2026-09-24: fixes applied — Caught it immediately via git sta
priority: normal
scope:
  agents: ["all"]
  ventures: ["outreach"]
  harnesses: ["all"]
triggers: []
source: Learnings#10358 (OUTREACH close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] OUTREACH 2026-09-24: fixes applied — Caught it immediately via git status, restored the file with `git checkout HEAD -- <path>` (this branch's own last commit, not main), verified git diff showed no residual change, and switched to git show <ref>:<path> for all further cross-branch inspection this run | No data was actually lost (nothing was uncommitted at the time beyond the one already-committed file, which restored cleanly) -- logging this so the near-miss is on record and the next agent reads git show first

Why: Auto-drafted by learnings-applier-agent from Learnings row 10358 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
