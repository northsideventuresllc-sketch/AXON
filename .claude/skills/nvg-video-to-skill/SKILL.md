---
name: nvg-video-to-skill
description: >-
  POINTER ONLY (2026-09-20). Turning a tutorial video into a Claude skill via
  two independent AI watchers reconciled into one spec lives in nv-vault
  `.claude/skills/nvg-video-to-skill/SKILL.md`. Use this skill only to be
  redirected there; never treat this file as the method.
---

# nvg-video-to-skill → pointer

Full method, dependencies, and the worked example live in nv-vault:
`.claude/skills/nvg-video-to-skill/SKILL.md`.

One-line summary: Claude watches via the `claude-video` plugin, Gemini
watches the same link independently, the two reads get reconciled into one
spec tagged `confirmed` / `single-source` / `conflict`, a human resolves
only the conflicts, then `skill-creator` writes the skill.

Installed here 2026-09-20 alongside the canonical copy in nv-vault, per JB's
"install for all agents" ask — one home for the content, a pointer
everywhere a Claude agent might need to find it.
