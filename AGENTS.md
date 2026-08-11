# AXON repo — agent protocol

Load nv-vault context first: `_Command Center/CONTEXT-MAP.md` + `Sector 5 — AXON/Phase 1 Stack.md`.

- **Brain:** NI-Brain `kxijunwgbrlfzvgkhklo` · table `ni_brain_outreach` · `source=axon_ni_services`
- **No secrets in git** — GitHub Actions secrets or `ni_platform_secrets`
- **No auto-send** — Telegram approve required
- **Brand:** `NORTHSiDE` exact casing · operator **JB**

## Standing conventions (added 2026-08-11, JB-approved)

- **KNOWN GAP — no test framework installed.** Existing tests are hand-rolled `node tests/*.test.mjs` scripts run individually (e.g. `npm run test:research-runs`), not a framework like Vitest/Jest with a unified `npm test` + coverage. Don't assume standard test-runner conventions apply here until this is addressed. (Backlog item, not urgent.)
- **Merging to main always requires JB's explicit sign-off.** Never auto-merge a PR, even if build/lint pass. This matches the Hard Stop already locked in `nvg-operator-core`.
