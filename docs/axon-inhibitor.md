# AXON Inhibitor — retrieval-gain control

> AXON's missing layer. A store that only accumulates and never regulates what
> it surfaces is a warehouse, not a brain. The Inhibitor is the excitatory/
> inhibitory balance that makes computation possible — **store forever, express
> selectively.**
>
> Spec: `axon_research_findings` `a5ede57f-dfc5-410b-9987-352c10bd0e4e`
> (`brain_gap_category = inhibition`). Constraint: Decision #569 (JB LOCKED).

## The one hard constraint

**AXON NEVER FORGETS.** Every memory is stored permanently at full fidelity,
forever. There is **no eviction, no TTL, no pruning, no decay, no expiry, no
archive tier** anywhere in AXON memory. A memory silent for a year returns at
full strength the moment the context calls for it. **Silence is not deletion.**

The dial is on **retrieval**, never on **retention**. What the Inhibitor
controls is *which memories are pulled into working context right now* — chosen
live, per query, by signals about the current task. It never writes a keep/drop
verdict back to the store.

Source concept: the Inhibitor chip suppresses the *expression* of Peter
Parker's spider DNA without editing or removing the DNA, tuned to a baseline,
fully reversible. Biology: adaptive gain control — the locus coeruleus /
norepinephrine system (Aston-Jones & Cohen 2005). Inhibition alone gives
rigidity; excitation alone gives noise; together they are adaptive gain.

## Four parts

### 1. Retrieval gain (live, never persisted)

`computeRetrievalGain(memory, context)` — `lib/axon-inhibitor-core.mjs`.

Pure and deterministic, recomputed on every query from live context signals:

- **relevance** — term overlap between memory content and the task text
- **continuity** — overlap with the immediately preceding conversation turns
- **typeAffinity** — how the memory's type fits the current channel
- **confidence** — the memory's own stored provenance confidence

**There is no age term.** A year-old memory and one written today score
identically given the same context match. That is the NEVER-FORGETS constraint
made arithmetic — proven by test `no decay: a year-old memory returns at full
strength`.

### 2. Broadcast budget (the Global Workspace mechanism)

`selectMemoriesForContext(memories, context, opts)`. The full memory pool
competes — nothing is pre-hidden — and only `MEMORY_BROADCAST_BUDGET` (12)
memories surface into working context. Limited capacity **is** the Global
Workspace mechanism, not a limitation of it. This is the memory-side sibling of
`JSPACE_MAX_CONCEPTS` (concept slots) in `axon-j-space-core.mjs`.

Selection is two-phase: a **gain phase** takes the top `budget − FOREIGN_SLOTS`
by gain, then a **foreign phase** (maximal marginal relevance) fills the
remaining `FOREIGN_SLOTS` (3) with the highest-gain memories *least similar* to
what was already picked — so the surfaced set cannot collapse into one theme.

Live wiring: `lib/axon-web-chat.ts` now calls `fetchMemoriesGated` instead of a
flat newest-15 fetch. Same store, gated expression.

### 3. Inhibitory node — verifier ≠ producer

`requireDistinctVerifier(producerId, verifierId)` / `pickVerifier(...)`. In
cortex, an agent that grades its own output is unopposed excitation. The guard
throws if the verifier is the producer (case-insensitive). Wire it into any
producer→verify hop in the agent graph (see `graph-engineering`); it is the
enforcement primitive, not a suggestion.

### 4. Foreign-input feed — the excitatory counterweight

`scripts/axon-foreign-input.mjs` + `.github/workflows/axon-foreign-input.yml`
(Tue/Thu/Sun 11:00 UTC, offset from self-research). Retrieval gain that only
amplifies the current context is positive feedback — the agent converges and
gets stuck (Schneider's "entropy"). Each run posts one concept from a domain
deliberately *off* AXON's operational map (ecology, materials science, music
theory, …) into J-space. **Additive only** — it posts a concept, it never
deletes, expires or downgrades any memory.

## What was deliberately NOT touched

- **`axon_memories.memory_tier` (free_chat vs pro)** — a billing boundary, the
  one explicit exception in the spec. Untouched.
- **`axon_memories.expires_at`** — the column exists today; the Inhibitor does
  not read, set or honor it as a retention control. If any process is expiring
  memory by it, that pre-existing contradiction is flagged for JB in
  `scripts/axon_inhibitor_bc.sql` (no DROP proposed — that's a data decision).

## Files

| Path | Role |
|------|------|
| `lib/axon-inhibitor-core.mjs` | Retrieval gain, broadcast budget, foreign slots, distinct-verifier node |
| `lib/axon-inhibitor.ts` | TS wrapper — gated pool read for working context |
| `lib/axon-foreign-input-core.mjs` | Foreign-domain rotation + concept builder |
| `scripts/axon-foreign-input.mjs` | Scheduled excitatory feed |
| `.github/workflows/axon-foreign-input.yml` | 3x/week scheduler |
| `scripts/axon_inhibitor_bc.sql` | **Proposed** migration (trace table + FTS index) — DO NOT APPLY, JB approves |
| `tests/axon-inhibitor.test.mjs` | 8 checks incl. the no-decay invariant |

## Migrations

`scripts/axon_inhibitor_bc.sql` is **proposed, not applied** (applying is a Hard
Stop). It adds only retrieval-side observability (`axon_retrieval_trace` — a
diagnostic log that can be truncated with zero memory loss) and a scale-out FTS
index on `axon_memories.content`. Nothing in it adds eviction, TTL, decay or an
archive tier. JB reviews and applies.

## Run

```bash
npm run test:inhibitor      # prove the layer, incl. the no-decay invariant
npm run foreign-input:dry   # preview the excitatory feed without posting
```

## References

- `axon_research_findings` a5ede57f — the spec (implementation_hint is authoritative)
- Decision #569 — AXON NEVER FORGETS (JB LOCKED 2026-08-04)
- Aston-Jones & Cohen 2005 — adaptive gain, locus coeruleus/norepinephrine (https://pubmed.ncbi.nlm.nih.gov/16022602/)
- `docs/axon-j-space.md` — the limited-capacity workspace this budgets
