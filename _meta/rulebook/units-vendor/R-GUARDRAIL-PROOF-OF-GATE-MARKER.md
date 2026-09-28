---
type: reference
id: R-GUARDRAIL-PROOF-OF-GATE-MARKER
title: "The boot-contract-fired-at marker is the ONLY proof hooks are live"
priority: should
kind: guardrail
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["proof of gate marker", "boot-contract-fired-at", "gates off", "silent hook failure"]
source: "Decision ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908; every repo CLAUDE.md PROOF OF GATE"
lives_in:
  - "every repo CLAUDE.md 'PROOF OF GATE' section (6+ copies)"
  - "nv-vault .nvg/boot-contract-fired-at (per-session marker file)"
  - "nv-vault scripts/install-workspace-hooks.mjs"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, guardrail, hooks]
---

A fired/scheduled session rooted at a multi-repo workspace parent with no `.claude/settings.json` there never actually loads that repo's hooks as harness enforcement — CLAUDE.md/AGENTS.md still load via recursive discovery, which makes the session look gated when it isn't. The only proof is `${CLAUDE_PROJECT_DIR:-.}/.nvg/boot-contract-fired-at` dated this session; missing it means say so in one line and never claim mechanical enforcement that can't be proven.

See [[_meta/rulebook/INDEX|Rulebook Index]].
