---
type: reference
id: LEARN-9463-learned-claude-code-session-2026-09
title: claude-code-session 2026-09-21: matchfit#410's third CI run failed on 
priority: normal
scope:
  agents: ["all"]
  ventures: ["multi-repo"]
  harnesses: ["all"]
triggers: []
source: Learnings#9463 (claude-code-session close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] claude-code-session 2026-09-21: matchfit#410's third CI run failed on the one test that shells out to a real ffmpeg binary — why: ffmpeg-static was never added as a dependency despite the code trying to use it, so the function has always silently fallen back to a bare ffmpeg on PATH - and CI has no ffmpeg installed. This test has likely never once passed in CI; lint then typecheck always failed first and hid it. — fix now in place: No fix pushed - proposed two alternatives (apt-get install ffmpeg in the workflow, or add ffmpeg-static/@ffmpeg-installer/ffmpeg as a devDependency) in a PR comment, explicit that neither option is skipping or disabling the test

Why: Auto-drafted by learnings-applier-agent from Learnings row 9463 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
