---
id: R-LRNB-014
title: Revert Next.js's auto-injected agent-rules block, never commit it
type: reference
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: [next build, next dev, AGENTS.md changed, CLAUDE.md changed, next.js 16]
source: "Learning #9863"
version: 1
updated: 2026-09-24
status: active
---
Next.js 16.3's `next build`/`next dev` auto-writes an "agent rules" block into AGENTS.md/
CLAUDE.md (node_modules/next/dist/server/lib/generate-agent-files.js), including text telling
agents to commit it. After any `next` command in a Next 16.3+ repo, run `git status`; if
AGENTS.md/CLAUDE.md changed and you did not edit them, `git checkout -- AGENTS.md CLAUDE.md`
and never commit the injected block.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
