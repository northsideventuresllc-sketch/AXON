# AXON cognitive architecture — reasoning core, Core/Personal split, second-brain learning

> **Draft proposal, 2026-07-23.** Design only — no new infra shipped in this pass.

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
| Where | This repo — versioned | One Supabase project per user (locked 2026-07-14, Context id 421) |
| Updates | Ships like normal software updates | Never overwritten by a Core update |

**Cross-device "in seconds" isn't a sync protocol** — it's routing. Core ships static with
every client; a device authenticates and points at the same per-user Supabase every other
device already uses. Nothing to copy or reconcile.

**Provisioning: lazy, not on signup.** A per-user Supabase project is created on the first
event that actually needs personalization (first preference set, first connector enabled,
first saved chat) — not at account creation. Matches AXON's existing cost discipline (the
$20/mo API cap and free-tier posture already in the README): most signups won't reach a real
personalization event, so provisioning on signup would mean paying for empty databases.
`getOperatorProfile`/`updateOperatorProfile` already have the right shape for this — the
provision-on-first-write path is an addition to those, not a new subsystem.

## 3. Second-brain passive learning

Not a new system — widen two that exist: `axon-step-learn.ts` (passive in-product logging)
and AX-WISDOM-LOOP (absorb pipeline). The gap is the *outside*-AXON surface: opt-in
connectors to tools the user already lives in, feeding the same pipeline.

Passive learning ≠ silent access: every connector is a visible, revocable, read-only-by-default
grant, Personal-layer only, never a Core default.

**First connector: Gmail, read-only.** Highest-signal, most universal source of who someone
is and what they're working on — richer and more available than calendar or notes alone, and
this org already has a working Gmail MCP integration pattern to model the adapter on. Calendar
is the natural second connector once Gmail proves the pipeline.

## Related
`lib/axon-fire-gate.ts` · `lib/axon-step-learn.ts` · `lib/axon-profile.ts` ·
`docs/axon-wisdom-loop.md` · `docs/axon-j-space.md`
