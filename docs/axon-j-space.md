# AXON J-Space & Autonomous Self-Research

> Application-layer implementation of Anthropic's J-space global workspace discovery (Jul 2026), tuned for NORTHSiDE AXON self-improvement.

## What is J-Space?

In July 2026, Anthropic published [*Verbalizable Representations Form a Global Workspace in Language Models*](https://transformer-circuits.pub/2026/workspace/) showing that Claude **spontaneously developed** an internal representational subspace — the **J-space** — during scale optimization. It was not hard-coded.

### How Anthropic found it

1. **Jacobian lens (J-lens)** — For each vocabulary token, compute the internal activation pattern that maximizes future probability of saying that word.
2. **J-space** — The sparse subframe of these verbalizable representations spanning Claude's residual stream.
3. **Discovery** — J-space emerged in pretrained models and gained assistant persona signatures during post-training.

### Five functional properties (mirroring global workspace theory)

| Property | Claude J-space | Human brain analogue |
|----------|----------------|----------------------|
| Reportable | Operator can ask what's "on its mind" | Conscious access |
| Modulatable | Can focus/hold concepts silently | Directed attention |
| Reasoning | Multi-step math/plans in J-space before output | Working memory reasoning |
| Flexible | One concept ("France") feeds many downstream tasks | Workspace broadcast |
| Selective | Fluency/grammar skip J-space; complex cognition needs it | Automatic vs deliberate |

### Key differences AI still lacks (brain gaps)

From [Dehaene & Naccache commentary](https://unicog.org/wp_2025/wp-content/uploads/2026/07/Dehaene-and-Naccache-Workspace-commentary-on-Gurnee-Lindsey-June-2026.pdf) and Anthropic:

1. **Recurrent loops** — Brain sustains workspace via cycling signals; transformers use single feedforward pass (depth ≈ time).
2. **Episodic memory** — No enduring autobiographical memory that updates from lived experience.
3. **Embodied self** — No body, pain/pleasure, spatial location.
4. **Multimodal workspace** — J-space is verbal; human workspace spans images, motor plans, feelings.
5. **Competitive ignition** — Brain has sharp workspace entry competition; J-space competition is softer.
6. **Autonomous agency** — No continuous self-directed goal pursuit without prompting.
7. **Continuity of self** — No stable embodied self across sessions.
8. **Offline consolidation** — No sleep-like memory reprocessing.

## How AXON implements J-Space

AXON cannot access Claude's internal activations. We implement a **global workspace analogue** at the orchestration layer:

```
┌─────────────────────────────────────────────────────────┐
│                    AXON J-Space                          │
│  ≤6 active verbalizable concepts (capacity-limited)      │
│  Broadcast → chat | briefing | outreach | research       │
└─────────────────────────────────────────────────────────┘
         ▲                              │
         │ postConcept()                ▼
┌────────────────┐              ┌───────────────────┐
│ Auto-Research  │              │ Implementation    │
│ 4x/week        │──────────────│ Queue → backend   │
└────────────────┘              └───────────────────┘
```

### NI-Brain tables

| Table | Purpose |
|-------|---------|
| `axon_jspace_state` | Active concepts, broadcast queue, gap backlog, implementation queue |
| `axon_research_findings` | Autonomous research outputs |
| `axon_research_runs` | Audit log + weekly rate limit |

### Maximization strategy

1. **Route high-order decisions through J-space** before execution (chat system prompt injection).
2. **Capacity limit (6 concepts)** — competitive salience eviction mimics workspace bottleneck.
3. **Broadcast** to all downstream modules each research cycle.
4. **Gap backlog** — track brain capabilities AI lacks; mitigations become implementation items.
5. **Auto-research** fills findings → implementation queue → briefing → operator review.

## Autonomous Research (4x/week)

**Schedule:** Mon/Wed/Fri/Sat at 6:00 AM EST (11:00 UTC)

**Lanes (rotating):**

| Lane | Studies |
|------|---------|
| `ai_models` | LLM architectures, agent memory, J-space, self-improvement |
| `open_source` | GitHub repos — agent frameworks, memory layers, orchestration |
| `neuroscience` | Global workspace theory, brain gaps, consolidation |

**Outputs:**

- 2–4 findings stored in `axon_research_findings`
- J-space concepts posted from synthesis
- **Daily brief items** added automatically:
  - `🔬 Research: <headline>`
  - `⚡ Implement: <high-priority finding>` (when applicable)

### Manual run

```bash
npm run research
# Or dry run:
AXON_DRY_RUN=1 npm run research

# GitHub Actions → AXON Self-Research → workflow_dispatch
# API: POST /api/axon/research/run { "lane": "open_source", "force": true }
```

### View state

```bash
# GET /api/axon/jspace
```

## Files

| Path | Role |
|------|------|
| `lib/axon-j-space-core.mjs` | J-space state, concepts, broadcast, gap catalog |
| `lib/axon-j-space.ts` | TS wrapper + prompt loader |
| `lib/axon-research-core.mjs` | Research engine (SerpAPI + GitHub + Haiku) |
| `lib/axon-research-run-core.mjs` | GitHub Actions dispatch |
| `scripts/axon-self-research.mjs` | Cron script |
| `scripts/axon_jspace_research_bc.sql` | NI-Brain schema |
| `.github/workflows/axon-self-research.yml` | 4x/week scheduler |

## References

- [Anthropic: A global workspace in language models](https://www.anthropic.com/research/global-workspace)
- [Transformer Circuits: Full paper](https://transformer-circuits.pub/2026/workspace/)
- [anthropics/jacobian-lens](https://github.com/anthropics/jacobian-lens) — open-source J-lens implementation
- [Dehaene & Naccache commentary](https://unicog.org/wp_2025/wp-content/uploads/2026/07/Dehaene-and-Naccache-Workspace-commentary-on-Gurnee-Lindsey-June-2026.pdf)
