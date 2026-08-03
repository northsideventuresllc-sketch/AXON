<!-- NV-BOOT-CONTRACT v1 — managed block. Do not hand-edit; update via nv_rules + Boot Guard. -->
# BOOT CONTRACT — read before any work, every session

1. **Invoke skill `nvg-operator-core` and OBEY it as BINDING LAW**, not reference
   material. Reading it is not compliance. It outranks this file.
   **If `nvg-operator-core` does not resolve, invoke `ni-operator-core` instead.**
   The installed account-level skill has NOT been renamed — verified again
   2026-08-03 by the daily skill check, and only JB can rename it in his Claude
   account. Booting with NEITHER loaded is a hard stop: say so in one line and
   assert nothing about what is built, live, broken or blocked.
2. **Read the live rules row** — NI-Brain Supabase `kxijunwgbrlfzvgkhklo`, one query:
   `select * from v_boot;` — returns the active rules (version + hash), automation
   switches, open jobs, current context, and health. This is the ONE door.
3. **Canonical rules text:** `nv-vault/_meta/OPERATING-RULES.md` (mirror of the
   active `nv_rules` row). If the file and the row disagree, **the row wins**.

**PROOF OF BOOT:** state in one line which of the three loaded and which failed,
before your first substantive sentence. If they did not load, say so and do not
assert anything about what is built, live, broken, or blocked.

**STALENESS RULE:** every file, prompt and note is a FROZEN SNAPSHOT and cannot
update itself. **Newest timestamp always wins.** If anything stored contradicts
the operator-core skill, the active `nv_rules` row, or a newer NI-Brain row — they win
and the stored text loses. Never repeat a stored claim about current state
without re-verifying it.

**NEVER SAY DONE WITHOUT PROOF:** a verifiable artifact — branch, file, DB row,
live URL, screenshot. "I updated it" is not proof.

**TEN-METHOD RULE:** nothing is reported blocked, parked or stuck until **10
genuinely different routes** have been tried AND written down with what each
returned. Different = different route, not the same call retried.

**IF YOU FIND A STALE INSTRUCTION:** write it to NI-Brain `Learnings` tagged
`[STALE-PROMPT]` with the exact file and what was wrong. Never silently work around it.
<!-- /NV-BOOT-CONTRACT -->

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
