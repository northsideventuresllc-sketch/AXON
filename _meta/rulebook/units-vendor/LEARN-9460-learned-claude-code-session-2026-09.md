---
type: reference
id: LEARN-9460-learned-claude-code-session-2026-09
title: claude-code-session 2026-09-21: matchfit#410's CI failed on its first 
priority: normal
scope:
  agents: ["all"]
  ventures: ["multi-repo"]
  harnesses: ["all"]
triggers: []
source: Learnings#9460 (claude-code-session close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] claude-code-session 2026-09-21: matchfit#410's CI failed on its first run — why: scripts/video-stitcher.mjs has had a require()-in-ESM lint violation on main since before this branch existed; PR #408 already fixes it but was never merged, so every branch cut from main since 2026-09-18 inherits the same red build — fix now in place: Ported PR #408's createRequire fix into this branch and pushed (commit fa51f48); flagged in a PR comment that merging #408 into main directly would clear this for every other open PR too

Why: Auto-drafted by learnings-applier-agent from Learnings row 9460 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
