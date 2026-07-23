# AXON cognitive architecture — reasoning core, Core/Personal split, second-brain learning

> **Draft proposal, 2026-07-23.** Design only — no new infra shipped in this pass. Per-user
> provisioning, OAuth scopes, and connector consent UX are open decisions for JB.

## 1. AX-REASON-CORE — educated guessing, not lazy prediction

Weak/cheap models (Haiku, local Ollama, heuristic fallback) get leaned on most for cost, so
they need the best critical-thinking scaffold — outside the model, not inside it:

1. **Hypothesis + falsifier** — model states its answer and what would prove it wrong.
2. **Explicit confidence tag** (`high`/`medium`/`low`/`guessing`) — no hiding uncertainty
   behind fluent text.
3. **Gate on the tag**, same shape as `axon-fire-gate.ts` HOLD/FIRE: low-confidence output
   can't drive an autonomous action, independent of FIRE mode.

Plug in first at the three surfaces that already produce model output:
`axon-research-core.mjs`, the outreach draft path, `axon-web-chat.ts`.

## 2. AXON Core vs. AXON Personal

| | Core | Personal |
|---|---|---|
| What | Code, prompts, skills, tools | Preferences, history, wisdom, connected-data grants |
| Where | This repo — versioned | Per-user Supabase (per the 2026-07-14 decision, Context id 421) |
| Updates | Ships like normal software updates | Never overwritten by a Core update |

**Cross-device "in seconds" isn't a sync protocol** — it's routing. Core ships static with
every client; a device authenticates and points at the same per-user Supabase every other
device already uses. Nothing to copy or reconcile.

Open for JB: provisioning timing (signup vs. lazy), hosting model (per-user projects vs.
multi-tenant schema) — decide before building.

## 3. Second-brain passive learning

Not a new system — widen two that exist: `axon-step-learn.ts` (passive in-product logging)
and AX-WISDOM-LOOP (absorb pipeline). The gap is the *outside*-AXON surface: opt-in
connectors to tools the user already lives in, feeding the same pipeline.

Passive learning ≠ silent access: every connector is a visible, revocable, read-only-by-default
grant, Personal-layer only, never a Core default. First connector to build is JB's call.

## Related
`lib/axon-fire-gate.ts` · `lib/axon-step-learn.ts` · `lib/axon-profile.ts` ·
`docs/axon-wisdom-loop.md` · `docs/axon-j-space.md`
