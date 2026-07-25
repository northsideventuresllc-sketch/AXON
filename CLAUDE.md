@AGENTS.md

---

## ⛔ STOP — READ THIS BEFORE ANYTHING ELSE

**These five rules exist because they were broken. Breaking them again wastes JB's money and time.**

### 1. GitHub is the source of truth. Always. No exceptions.
Every NVG repo is on GitHub under `northsideventuresllc-sketch`. **Clone from GitHub. Read from GitHub. Push to GitHub.**
- The auth token is in NI-Brain: `select value from ni_platform_secrets where key='GH_PAT'`.
- **Never** go looking for code on a local Mac, a mounted folder, or a device bridge.
- Repos: `matchfit` · `northside-intelligence` · `axon` · `nv-vault`.

### 2. Every app repo is **Next.js**.
`matchfit` is Next.js 16 / React 19 / Prisma / Supabase / Stripe / Resend. If you are guessing at the stack, you have not read the repo. Read the repo.

### 3. **NOTHING runs on the MacBook Pro. Mac mini only.**
Obsidian, Hermes and Ollama are **not installed** on the MacBook Pro. Every local operation — vault, Hermes crons, dispatch execution, local models, Chrome posting — happens on the **Mac mini**.

The Cowork device bridge binds to `macbook-pro-4-local`. **That machine is empty.** Any plan routed through the bridge **will fail**. Do not stage files to it, do not read the vault from it, do not try to run anything on it. Use GitHub for code and NI-Brain for state — see rule 1.

### 4. **GitHub PATs DO NOT EXPIRE.**
The vault token was replaced 2026-07-04 as **non-expiring**. Any note claiming a PAT expires (including `_ni-brain/reference_infrastructure.md`'s "expires 2026-07-16") is **stale and wrong**. **Never raise PAT expiry as a blocker.** JB has corrected this repeatedly.

### 5. Resend: JB has **TWO** accounts.
`RESEND_API_KEY` (Match Fit) and `RESEND_API_KEY_NI` (NORTHSiDE Intelligence) — both in `ni_platform_secrets`. A connector or key that only sees one account tells you **nothing** about the other. **Never report a domain as missing without checking both.**

### 6. How to talk to JB — plain English only.
JB has ADHD and dyslexia and is paying for output, not narration.
- **Lead with what to DO**, not what you scanned.
- **No internal identifiers** in the summary — no table names, no job codes, no lint-rule names. Those go in the doc, not the message.
- **Short sentences. Bold the key word. No walls of text.**
- **Never report a blocker you have not confirmed.** "I couldn't check X" is not a blocker — it's your problem to solve.
- **Work until it's done.** Do not come back with a list of things for JB to do that you could have done yourself.

---



## ⛔ STOP — READ THIS BEFORE ANYTHING ELSE

**These five rules exist because they were broken. Breaking them again wastes JB's money and time.**

### 1. GitHub is the source of truth. Always. No exceptions.
Every NVG repo is on GitHub under `northsideventuresllc-sketch`. **Clone from GitHub. Read from GitHub. Push to GitHub.**
- The auth token is in NI-Brain: `select value from ni_platform_secrets where key='GH_PAT'`.
- **Never** go looking for code on a local Mac, a mounted folder, or a device bridge.
- Repos: `matchfit` · `northside-intelligence` · `axon` · `nv-vault`.

### 2. Every app repo is **Next.js**.
`matchfit` is Next.js 16 / React 19 / Prisma / Supabase / Stripe / Resend. If you are guessing at the stack, you have not read the repo. Read the repo.

### 3. **NOTHING runs on the MacBook Pro. Mac mini only.**
Obsidian, Hermes and Ollama are **not installed** on the MacBook Pro. Every local operation — vault, Hermes crons, dispatch execution, local models, Chrome posting — happens on the **Mac mini**.

The Cowork device bridge binds to `macbook-pro-4-local`. **That machine is empty.** Any plan routed through the bridge **will fail**. Do not stage files to it, do not read the vault from it, do not try to run anything on it. Use GitHub for code and NI-Brain for state — see rule 1.

### 4. **GitHub PATs DO NOT EXPIRE.**
The vault token was replaced 2026-07-04 as **non-expiring**. Any note claiming a PAT expires (including `_ni-brain/reference_infrastructure.md`'s "expires 2026-07-16") is **stale and wrong**. **Never raise PAT expiry as a blocker.** JB has corrected this repeatedly.

### 5. Resend: JB has **TWO** accounts.
`RESEND_API_KEY` (Match Fit) and `RESEND_API_KEY_NI` (NORTHSiDE Intelligence) — both in `ni_platform_secrets`. A connector or key that only sees one account tells you **nothing** about the other. **Never report a domain as missing without checking both.**

### 6. How to talk to JB — plain English only.
JB has ADHD and dyslexia and is paying for output, not narration.
- **Lead with what to DO**, not what you scanned.
- **No internal identifiers** in the summary — no table names, no job codes, no lint-rule names. Those go in the doc, not the message.
- **Short sentences. Bold the key word. No walls of text.**
- **Never report a blocker you have not confirmed.** "I couldn't check X" is not a blocker — it's your problem to solve.
- **Work until it's done.** Do not come back with a list of things for JB to do that you could have done yourself.

---



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
