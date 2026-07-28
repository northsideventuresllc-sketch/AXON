# MERGE + DEPLOY — DUAL ROUTE (locked)

> **JB, 2026-07-28:** *"When merging and deploying, this needs to be done on the NI-Portal route and AXON route."*

AXON ships to **two surfaces**. A merge that lands on one and not the other is a
**failed deploy**, not a partial one. There is no such thing as "deployed to AXON."

| Route | Repo → target | What JB opens |
|---|---|---|
| **AXON route** | this repo → Vercel **workspace** project | `workspace-*.vercel.app/axon` |
| **NI-Portal route** | this repo → `northside-intelligence` → its Vercel project | `northsideintelligence.com/axon-{username}/dashboard` |

Env vars, URLs and the standalone `basePath` rules live in
[`deploy-ni-path.md`](./deploy-ni-path.md). This file is the **merge protocol**.

---

## How each route actually fires

**AXON route** — Vercel builds this repo on push to `main`. Automatic.

**NI-Portal route** — `.github/workflows/sync-ni-portal.yml` fires on push to
`main`, **only when a changed path matches its `paths:` filter**. It clones
`northside-intelligence`, runs `scripts/sync-portal-ui.mjs`, and pushes straight
to that repo's `main` using `NI_GITHUB_PAT`.

**That push is a direct production deploy of another repo.** Treat it with the
same care as pushing to `northside-intelligence` by hand.

### The trap this protocol exists to close

The trigger `paths:` list and the file manifests inside `sync-portal-ui.mjs` are
two separate lists that must agree. On 2026-07-28 they did not: **10 files the
sync script copies into the portal were not in the trigger list** — including
`app/api/axon/chat/route.ts`, `app/api/axon/preferences/route.ts` and
`lib/dispatch-session-store.ts`. Changing any one of them alone would deploy the
AXON route and silently skip the NI-Portal route, leaving the portal running old
code with no error anywhere.

Guard: **`npm run test:portal-sync`** asserts every file in the manifest is
watched by the workflow and still exists on disk. It runs inside the sync
workflow too. If you add a file to a manifest in `sync-portal-ui.mjs`, add its
path to the `paths:` filter in the same commit or the test fails.

---

## The checklist — every merge, no exceptions

**Before merging**

1. `npm run test:portal-sync` — passes.
2. Run the tests touching what you changed (`npm run test:*`).
3. `npm run build` — passes.
4. CODE-CHECK gate per `nv-vault/CLAUDE.md` for any product code. Final summary
   must carry `CODE-CHECK: PASS`.
5. Ask the routing question out loud: **does this diff touch anything in a
   `sync-portal-ui.mjs` manifest?** If yes, the NI-Portal route is in play and
   steps 8–10 are mandatory.

**Merging**

6. Merge the PR to `main`.

**After merging — verify BOTH routes with artifacts, never from memory**

7. **AXON route:** Vercel workspace deployment reaches `READY`, and
   `workspace-*.vercel.app/axon/login` loads.
8. **NI-Portal route:** the `Sync AXON UI to NI Portal` run is green — and read
   its log. `No portal changes to push.` on a diff that *did* touch a manifest
   file means the sync silently no-opped. That is a failure, not a pass.
9. A new commit exists on `northside-intelligence` `main` from the sync bot.
10. That repo's Vercel deployment reaches `READY`, and
    `northsideintelligence.com/axon-{username}/dashboard` serves the change.

**If the NI-Portal route did not fire**

Do not hand-patch the portal. Fix the cause — add the missing path to the
`paths:` filter — then re-run the workflow (`workflow_dispatch`) so the fix is
what ships. Hand-patching hides the drift and it comes back.

---

## Manual fallback

Only when the workflow is genuinely unavailable, and after the ten-method rule:

```bash
git clone https://github.com/northsideventuresllc-sketch/northside-intelligence.git
node scripts/sync-portal-ui.mjs ./northside-intelligence
cd northside-intelligence && npm install && npm run build   # must pass before pushing
NI_GITHUB_PAT=… ../scripts/push-ni-portal.sh . main
```

---

## Standing rules for this repo

- **Never say deployed without both routes proven** — a run URL, a commit SHA on
  `northside-intelligence`, and a `READY` deployment. Rules v2 §3.
- **The FIRE/HOLD gate is not a deploy gate.** `lib/axon-fire-gate.ts` defaults to
  HOLD and fails safe to HOLD when NI-Brain is unreachable. It blocks outreach
  sends, dispatch fires, cron enabling and content publish. Deploying code that
  respects the gate is fine; never work around the gate to make a task complete.
- **Secrets never enter git.** `NI_GITHUB_PAT` lives in AXON Actions secrets;
  everything else in `ni_platform_secrets`.
- **Write-back on every ship** — NI-Brain `Learnings` plus the vault session log,
  with the PR number and both SHAs, in the same pass as the merge.
