# AXON cognitive architecture — reasoning core, Core/Personal split, second-brain learning

> **Status: draft architecture proposal, 2026-07-23.** JB requested three capability pillars
> in one pass (reasoning quality, Core vs. Personal + cross-device, passive second-brain
> learning). None of these ship as working infrastructure in this doc — each has real
> security/privacy/infra decisions that are JB's to make (per-user provisioning, third-party
> OAuth scopes, consent UX). What follows is a concrete design grounded in what AXON already
> has (`axon-fire-gate.ts`, `axon-step-learn.ts`, `axon-j-space-core.mjs`, operator-id
> profile pattern), so it's buildable in stages rather than a rewrite.

---

## 1. AX-REASON-CORE — educated guessing over next-token guessing

**Problem stated by JB:** frontier models are trained to predict the next plausible token, not
to reason carefully — "lazy" prediction. The weakest AXON models (Haiku, local Ollama scoring
in `axon-local-model-daily.mjs`, heuristic fallbacks) need the *best* critical-thinking
scaffold, not the model with the best scaffold — because they're the ones AXON leans on most
for cost reasons (see the Haiku → Gemini → heuristic cascade in `axon-research-core.mjs`).

**Design: the scaffold is model-agnostic and sits outside the model, not inside it.** A weak
model wrapped in a disciplined process outperforms a strong model with none. Concretely, every
AXON call that produces a decision, a draft, or a finding — not simple retrieval — routes
through a reasoning contract with three stages:

1. **Hypothesis, not answer.** The model states its first-pass answer *and* what would have to
   be true for it to be wrong. This is already implicitly present in the workflow
   "adversarial verify" pattern used elsewhere in the org's tooling — AX-REASON-CORE makes it
   the default for AXON's own outputs, not just optional workflow scripts.
2. **Confidence tag, not silence.** Every output carries a calibrated confidence
   (`high` / `medium` / `low` / `guessing`) plus the one piece of missing information that
   would move it up a tier. "Guessing" is a legitimate, explicit output — better than a
   confident-sounding wrong answer. This is the direct fix for "lazy prediction": lazy
   prediction hides uncertainty behind fluent text, so surfacing it structurally removes the
   incentive to fake confidence.
3. **Gate on the tag, same shape as FIRE/HOLD.** `axon-fire-gate.ts` already blocks live
   actions until JB flips FIRE. AX-REASON-CORE adds a parallel, always-on gate: outputs tagged
   `low`/`guessing` that would drive an autonomous action (an outreach send, a dispatch, a
   published finding) get held for human review regardless of FIRE mode — confidence and
   autonomy are separate gates, so a "FIRE" org still can't let a guess auto-fire.

**Where it plugs in:** `lib/axon-research-core.mjs` (research findings), the outreach
draft path, and the chat/Jarvis reply path (`axon-web-chat.ts`) are the three surfaces that
already produce model output today — instrument those three before anything new.

**Not solved by prompting alone:** a system prompt asking the model to "think critically" is
exactly the lazy-prediction failure mode JB is naming — the model will produce fluent text
*about* being careful without the structural cost of actually stating uncertainty. The gate
has to reject ungated output, not just request calibration.

---

## 2. AXON Core vs. AXON Personal — the distribution split

**Problem stated by JB:** need a solid line between what every AXON install shares and
auto-updates (the "default") vs. what's fully locked to one person and customizable, plus
near-instant carry of both across devices.

**Grounding:** JB already locked a relevant decision (NI-Brain `Context` id 421,
2026-07-14): *"AXON Phase 1 = ... setup finalize (local per-user Supabase + install
guides)..."* — per-user Supabase was already the intended personal-data boundary. This section
operationalizes that.

### The split

| | **AXON Core** | **AXON Personal** |
|---|---|---|
| What it is | Code, prompts, skill catalog, tool definitions, the reasoning contract from §1 | Preferences, chat/outreach history, wisdom items, connected-data grants, step-learnings |
| Where it lives | This git repo — versioned, released, identical bytes for every install | A Supabase project scoped to one operator (per the 2026-07-14 decision) |
| Who can change it | NORTHSiDE ships updates; nobody else edits Core directly | Only the owning user — fully theirs, not merged, not shared |
| Update model | Pull-based: new Core release merges in like any software update | Never overwritten by a Core update — Core updates are additive (new capabilities available), never destructive to Personal state |
| Existing analogue in repo | `lib/`, `app/`, `.claude/skills/`, `docs/` | `axon-preferences.ts` + `axon-profile.ts`'s `context_data` blob, `axon_wisdom_items`, `Learnings` rows tagged per operator |

The mechanism already exists in miniature: `getOperatorProfile(operatorId)` /
`updateOperatorProfile` in `axon-profile.ts` already separates "the operator's stuff" from
"the code," keyed by `operatorId`. Today `operatorId` defaults to `'default'` because AXON is
single-tenant (one Supabase project, one operator, JB). Multi-user AXON is that same pattern
with `operatorId` resolving to a real per-user Supabase project instead of a shared one.

### Cross-device carry, "within seconds"

The insight worth locking in: **this isn't a sync protocol to build — it's a routing
problem.** A device doesn't need to copy Personal state to itself; it needs to authenticate
and point at the same per-user Supabase project every other device already points at. Core is
static and ships with the client (web build, or eventually a native/CLI install) — it doesn't
need syncing at all, only versioning.

```
device opens AXON client (Core, same on every device)
  → user authenticates (device-agnostic auth token)
  → token resolves to operator's per-user Supabase project URL
  → client reads Personal state live from that project
  → "sync" is just "always live," not a copy-and-reconcile step
```

This avoids the two hard problems multi-device sync usually runs into — conflict resolution
and offline merge — by never actually distributing the data. The cost is that it requires a
network round-trip on cold start (not truly offline-first); if offline capability becomes a
requirement later, that's a distinct, harder design (local cache + CRDT-style merge) and should
be scoped separately rather than assumed to fall out of this for free.

### Open decisions for JB (not resolved here)

- Per-user Supabase provisioning: on signup, or lazily on first "real" personalization event?
- Cost model: a free Supabase project per user has real ceilings at scale — worth deciding the
  provisioning path (NI-hosted multi-tenant schema vs. genuinely separate projects) before
  building rather than after.
- What, if anything, is shareable *back* from Personal into Core (e.g., a wisdom item generic
  enough to benefit everyone) — needs an explicit opt-in promotion path, not automatic, or
  Personal stops being "completely locked per user."

---

## 3. Second-brain passive learning

**Problem stated by JB:** AXON should get smarter about a user the more platform/tool access
that user grants — without the user ever having to say "learn this about me." The goal is an
electronic version of the person's thinking, minus biological limits (forgetting, fatigue,
inconsistency) — a second brain.

**This is not a new system — it's widening two that already exist:**

- **`axon-step-learn.ts`** already does *in-product* passive learning today: every meaningful
  action inside AXON's own tools writes a one-line `Learnings` row automatically, no explicit
  "remember this" required. The user already gets this for anything they do inside AXON.
- **AX-WISDOM-LOOP** (`docs/axon-wisdom-loop.md`) already does the absorb/salience/dedup work —
  Watch → digest → enhance → absorb, scoring what's worth keeping.

**What's missing is the *outside*-AXON surface.** The second-brain framing JB wants requires
watching signal from tools the user already lives in — not just what they do inside AXON's own
UI. That means AX-WISDOM-LOOP's "Watch" stage needs new, explicitly-opt-in source connectors
(read access to email, calendar, notes, whatever the user grants) feeding the same
digest/salience/absorb pipeline that already exists, so nothing about the absorption logic
needs to be reinvented — only the intake surface grows.

### Why "passive" cannot mean "silent" for the connectors themselves

The learning being invisible to the user (no explicit teaching required) is the correct
design — that's the whole point. But the *access grant* cannot be invisible, or this becomes
exactly the kind of silent-data-vacuum pattern that erodes trust and (per the OpenClaw research
finding already in this queue) is the same category of execution-surface risk that draws
security scrutiny on comparable agent platforms. Concretely:

- Every connected source is an explicit, visible, revocable grant — shown in AXON's UI as
  "AXON can see: Gmail (read), Calendar (read)..." — not a background permission the user
  forgets they gave.
- Read-only by default. Nothing about "AXON learns more the more access it gets" requires
  write access to those platforms.
- This is a Personal-layer decision (§2) per user, never a Core default — Core ships with zero
  connectors enabled; every connector is something a specific user turns on for themselves.

### Concrete next step

Model each new connector the same way `axon-step-learn.ts` models an in-product action: a
thin adapter that normalizes external signal into the same `StepLearnEvent`-shaped record and
hands it to the existing `Learnings` sink / AX-WISDOM-LOOP intake. The first connector to build
is whichever one JB actually wants first — this doc doesn't pick one, since that's a product
prioritization call, not an architecture one.

---

## Related

- `docs/axon-j-space.md` — J-space gap backlog and implementation queue (AX-REASON-CORE is
  filed there as a new gap category, see NI-Brain `axon_jspace_state`)
- `docs/axon-wisdom-loop.md` — the absorb pipeline §3 extends
- `lib/axon-fire-gate.ts` — the pattern §1's confidence gate mirrors
- `lib/axon-step-learn.ts`, `lib/axon-profile.ts`, `lib/axon-preferences.ts` — the existing
  per-operator primitives §2 and §3 build on
