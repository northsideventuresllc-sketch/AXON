---
type: reference
id: LEARN-9863-learned-2026-09-24-full-audit
title: 2026-09-24 full audit (streampass PR #14): Next.js 16.3 `next build`/`
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9863 (unknown)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] 2026-09-24 full audit (streampass PR #14): Next.js 16.3 `next build`/`next dev` auto-writes an "agent rules" block into AGENTS.md/CLAUDE.md (node_modules/next/dist/server/lib/generate-agent-files.js), including text telling agents to commit it. Trigger: after any next command in a Next 16.3+ repo, run git status; if AGENTS.md/CLAUDE.md changed and you did not edit them, revert with git checkout -- AGENTS.md CLAUDE.md and never commit the injected block. Applied-state check: no PR diff contains the framework-generated agent block. Also input for the rule translator design: framework tools now write into agent rule files, so compiled rule files must be regenerated/verified, not trusted as hand-edited.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9863 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
