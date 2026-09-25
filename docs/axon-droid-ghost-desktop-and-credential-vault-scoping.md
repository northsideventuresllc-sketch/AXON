# AXON Droid: Ghost Desktop runner + credential vault — scoping plan

**Status:** SCOPING ONLY. No credential storage and no isolated/"ghost" execution
environment is implemented by this document or its companion stub. This is the
architecture pass for BUILD ticket `b196ed62-d95c-4b32-8c00-5db57daf0c90`
("Build AXON Droid Computer-Use Engine: Ghost Desktop runner, credential vault
and live screen streaming").

## What already exists (do not re-scope this part)

The ticket title bundles three pieces. One of them already shipped:

| Piece | State | Where |
|---|---|---|
| Computer-use agentic loop | Built, gated on Accessibility permission (Decision #1857) | `lib/axon-computer-use.mjs` |
| **Live screen streaming** | **Built** — a polling live-view row per run (`BUILD-AXON-DROID-AGENT-0920`, merged PR #243) | `lib/axon-droid-live-view.mjs`, `sql/2026-09-21__axon_droid_live_frames.sql`, `components/axon/droid-scene.tsx` |
| **Ghost Desktop runner** | Not started | — |
| **Credential vault** | Not started | — |

The live-view slice is polling-based (a screenshot + status row upserted after
each action, read by a caller/UI), not a video/WebRTC stream. That was a
deliberate, disclosed scope decision in the PR that shipped it and is not
being revisited here. This plan only covers the two remaining pieces.

## Why these two are treated differently from a normal feature

Both pieces widen the computer-use capability's blast radius if built wrong:

- **Ghost Desktop runner** = running the computer-use loop against an
  isolated session instead of JB's live physical Mac mini session. Risk is
  mostly *correctness and cost* (a broken isolated environment, a second
  machine/VM to maintain) — not secret-handling risk by itself. This is why a
  bounded, honestly-labeled stub is safe to land now (see below).
- **Credential vault** = giving the runner (and, indirectly, the model loop
  driving it) access to secrets it does not have today. `axon-computer-use.mjs`
  currently works specifically *because* it never touches a credential — the
  Mac mini's browser session is already authenticated, and the system prompt
  explicitly instructs the model to stop at any login/password screen. A
  vault removes that guardrail by design. This is the hard-stop-adjacent part:
  real implementation needs JB sign-off on the security design first, per the
  ticket guidance and per the org rule that any change touching
  authentication/credential/session handling is flagged `hardStop=true`
  regardless of size.

## Part A — Ghost Desktop runner (architecture, no real isolation yet)

**Goal:** let a computer-use run target an isolated environment instead of
JB's live physical session, so a run can't collide with (or be watched
mid-keystroke by) whatever JB is actually doing on the mini at the time.

**Candidate approaches, cheapest/free-first (per org MONEY rule):**

1. **Second local macOS user account on the existing Mac mini** — free,
   zero new hardware, native Screen Recording/Accessibility grants per-user.
   Downside: still the same physical machine, so a hang/crash still costs
   the one machine's availability; multi-user login switching on macOS is
   not instant or scriptable in the way a server session is.
2. **Local VM on the Mac mini (UTM or Tart, both free/open-source, Apple
   Silicon-native)** — a real isolated macOS guest, no cloud spend, can be
   snapshotted/reset between runs. This is the most likely free path and
   should be prototyped first.
3. **A second physical machine** — only if (1) and (2) both prove
   insufficient (e.g. GPU/perf ceiling on a VM). Would need JB's explicit
   buy-in since it's new hardware, not just a design call.
4. **A paid cloud desktop/sandbox provider** — last resort only, per the
   free-tiers-first rule; not evaluated further until 1–3 are tried and
   written up as failed.

**Free alternative attempted for this pass:** none of 1–4 required spending
anything to *scope*; recommending (2) as the first thing to actually try,
before any paid option is even priced out.

**Interface boundary (what the minimal safe slice adds):** a single
`resolveRunnerTarget()` seam in `axon-computer-use.mjs`'s call path so the
*routing decision* (live session vs. ghost desktop) has one place to live,
without implementing the ghost target yet. Selecting the ghost target today
throws a clear "not implemented" error rather than silently no-op'ing or
falling back — the same fail-closed pattern `axon-mini-risk-gate.mjs` already
uses for unmatched shell payloads.

## Part B — Credential vault (architecture only — HARD STOP on real build)

**Do not build real credential storage or injection from this scoping pass
or its companion stub.** This section is the design proposal for JB to
approve or redirect before any code lands.

**Proposed shape, for review:**

- Reuse the existing secrets store (`ni_platform_secrets` / the AI Vault
  pattern already used across `axon`, `matchfit`, `northside-intelligence`)
  rather than standing up a new secrets system — one less thing to secure
  and audit.
- A credential is scoped to *one runner target + one task class* (e.g. "Gemini
  Flow session cookie, ghost-desktop-only"), never handed to the model as
  text, and never logged — injected directly into the isolated session
  (cookie/keychain import) by the runner process, outside anything the
  Claude computer-use loop can read back.
- Every credential use writes an audit row (who/what task/when/target) —
  same NI-Brain instance, a new table, service-role only, RLS deny-by-default
  (matching the pattern in `sql/2026-09-21__axon_droid_live_frames.sql` and
  the NI Portal's RLS-sensitive-tables migration).
- Only usable against the Ghost Desktop target, never the live session — so a
  vault bug can't leak a credential into JB's own physical Mac mini session.

**Open questions for JB (needs his business/security judgment, not ours):**

1. Which credentials actually need to live in a vault first (Gemini/Flow
   session only, or broader)?
2. Is a second isolated environment (Part A) a hard prerequisite before any
   vault work starts, or is there an acceptable interim scope?
3. Rotation/expiry policy and who gets alerted on vault-read anomalies.

## Done-criteria for *this* scoping pass

- This document exists and is accurate against the current repo state
  (verified 2026-09-24 against `lib/axon-computer-use.mjs`,
  `lib/axon-droid-live-view.mjs`, merged PR #243, Decision #1857).
- A minimal, honestly-labeled Ghost Desktop routing stub exists
  (`lib/axon-droid-runner-target.mjs`) that adds no real isolation, no
  credential handling, and fails closed when the unimplemented target is
  requested.
- Credential vault has zero lines of implementation code — design-only,
  pending JB sign-off.
- Opened as a PR for human review — not merged, not deployed.

## Explicitly out of scope for this pass

- Any real isolated execution environment (VM, second user, second machine).
- Any credential storage, retrieval, or injection code.
- Any change to `axon-computer-use.mjs`'s actual action-execution path beyond
  the routing seam described above.
