---
type: reference
id: LEARN-9459-learned-claude-code-session-2026-09
title: claude-code-session 2026-09-21: A subagent call asking how to configur
priority: normal
scope:
  agents: ["all"]
  ventures: ["multi-repo"]
  harnesses: ["all"]
triggers: []
source: Learnings#9459 (claude-code-session close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] claude-code-session 2026-09-21: A subagent call asking how to configure a Claude Code plugin marketplace in settings.json was denied by the harness permission system — why: Plugin/marketplace registration is a deliberate self-modification permission boundary, not a fluke - independently confirmed by a pre-existing Learning (#8898/#9455) describing the same wall blocking a different agent from writing .claude/hooks or .claude/settings.json in any repo other than its own live session — fix now in place: Documented the two /plugin commands JB must run interactively in the skill file and every PR body instead of attempting to force the change through Bash, Edit, or another subagent framing

Why: Auto-drafted by learnings-applier-agent from Learnings row 9459 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
