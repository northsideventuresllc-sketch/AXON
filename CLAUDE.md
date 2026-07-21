@AGENTS.md

> `AGENTS.md` above is AXON's full written protocol (nv-vault context load, NI-Brain table,
> no-secrets-in-git, no-auto-send, brand/operator rules). Claude Code has no chat-title trigger
> and no auto-loaded `.mdc`/rules layer — this file is that equivalent, loaded every session.
>
> This repo had exactly one Cursor-only artifact with no Claude Code equivalent:
> `.cursor/skills/axon-user-communication/SKILL.md` → ported unchanged to
> `.claude/skills/axon-user-communication/SKILL.md` (content was already portable). No
> `.cursor/rules/` directory exists in this repo, so there's nothing else to fold in here.
>
> **Safety note:** this is the org's autonomous-agent platform repo. It ships with a FIRE/HOLD
> gate (`lib/axon-fire-gate.ts`) that defaults to HOLD and fails safe to HOLD if NI-Brain is
> unreachable — it blocks outreach sends, dispatch fires, cron enabling, and content
> publish/schedule until JB flips it to FIRE. Respect that gate; never work around it to make a
> task "complete." `portal-integration/` pushes UI/API routes into the `northside-intelligence`
> repo via `scripts/sync-portal-ui.mjs` — that's a real cross-repo production deploy, treat it
> with the same care as a direct push to `northside-intelligence`.
