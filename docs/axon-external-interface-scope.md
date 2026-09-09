# AXON external interface — scope & design (no build yet)

> **Draft proposal, 2026-09-09. Scope/design only — nothing in this doc is built or wired.**
> Trigger: JB anticipates running low on Claude usage this week and wants AXON's routing +
> shared brain reachable from other coding harnesses (his own "Hermes" automation, Claude
> Code, Google Antigravity, VS Code/Cline/Continue-style tools) without heavy per-tool setup.

## 0. Summary / recommendation

Ship **both** shapes, in this order: a small authenticated **HTTP API** first (Phase 1),
then an **MCP server that is a thin wrapper around that same API** (Phase 2). They are not
really competing designs — every mainstream coding harness that speaks MCP over HTTP is, under
the hood, just doing authenticated HTTP with a particular JSON-RPC envelope on top. Building
the HTTP surface first means Hermes (plain cron/Actions scripts, no LLM, no MCP client) can
use AXON's brain on day one, and the MCP server becomes a thin, low-risk adapter on top of
already-working, already-tested endpoints instead of a second parallel implementation.

Recommended auth: **new per-harness bearer tokens**, minted and revocable per device/tool,
never the raw `AXON_DASHBOARD_SECRET` pasted into N config files. Details in §3.

Recommended v1 scope: **read + chat only** (`routeChat`/`axonGenerate`, Context/Decisions/
Learnings/wisdom reads). No write/agentic actions (firing agents, approving outreach,
mutating NI-Brain) from a remote harness until the read-only surface has run clean for a
while — see §4 and the open questions in §5.

---

## 1. Two shapes, compared honestly

### 1a. AXON as an MCP server other tools attach to

**What was actually verified (not assumed), September 2026:**

| Harness | MCP client support today | Remote (HTTP) transport | Auth for a remote server |
|---|---|---|---|
| **Claude Code** | Yes, mature. `claude mcp add --transport http <name> <url>`, or `.mcp.json` at project/user scope. Also usable as a settings.json entry. | `streamable-http` (recommended), `sse` (deprecated), `ws`. | Static `--header "Authorization: Bearer <token>"` (or `.mcp.json` `headers` with `${ENV_VAR}` expansion), a `headersHelper` script for tokens that need refreshing, or full OAuth 2.0 (`/mcp` interactive login, or pre-registered client-id/secret). |
| **Google Antigravity** (the Gemini-3-based agentic IDE/CLI that succeeded Gemini CLI/Code Assist in this workflow) | Yes. Config at `~/.gemini/config/mcp_config.json` (global) or `.agents/mcp_config.json` (workspace), or added through the editor's agent side panel. | `serverUrl` for remote Streamable HTTP/SSE (note: **`serverUrl`, not `url`** — a common copy-paste bug). | Static `headers` object (e.g. `Authorization: Bearer <token>`) — works. **OAuth-flow remote servers have an open bug** (GitHub `google-antigravity/antigravity-cli#25`, Sept 2026): the initialize request can go out with no bearer token attached. Static-token auth is the reliable path today; do not depend on Antigravity's OAuth handshake. |
| **VS Code (Copilot Agent mode)** | Yes, native since ~VS Code 1.99 (2025), with a further MCP-bridging step in 1.113/1.115/1.116 (Mar–Apr 2026) that lets a VS Code-configured MCP server also be reached from Copilot CLI and Claude sessions. MCP tools are **only visible in Agent mode**, not Ask/Edit. | HTTP/SSE via `mcp.json`, or discovery through the GitHub MCP Registry. | `headers` block in `mcp.json`, with an `inputs` array so Copilot prompts for and securely stores a secret the first time the server is used. |
| **Cline / Continue** (VS Code extensions, not VS Code itself) | Yes — both shipped MCP client support well before this task; Cline in particular popularized the "MCP marketplace" pattern AXON's own `mcp-marketplace.tsx` already borrows the *name* from (see §2 caveat). | HTTP/SSE via each extension's own `cline_mcp_settings.json` / `continue` config. | Same static-header pattern. |

**Verdict:** every harness JB named is a real, working MCP *client* today, and all of them
accept a remote HTTP server with a static bearer token in a header — that is the reliable,
lowest-risk auth path across all four. OAuth-per-harness is real in Claude Code and nominally
supported in Antigravity, but Antigravity's OAuth path has a live bug, so it is not yet a
safe default across the whole harness set.

**Setup burden (per harness, per device):** one JSON block or one CLI command
(`claude mcp add --transport http axon https://.../mcp --header "Authorization: Bearer …"`),
pasted once per machine/tool. No new software to run locally — the harness's own built-in
MCP client does the protocol work. This is "light setup," which is what JB asked for.

**What a harness can actually *do* with it:** MCP tools show up as first-class, model-callable
tools inside that harness's own agent loop — the coding agent can decide *on its own*,
mid-task, to call `axon_ask_brain` or `axon_chat` the same way it calls its own Read/Bash
tools, with the harness handling retries/reconnection/tool-schema display. This is strictly
richer than an HTTP API for an *agentic* harness, because the model itself is the caller, not
a human running curl or scripts written ahead of time.

**Real cost of this shape:** AXON has to speak the actual MCP JSON-RPC protocol
(`initialize`, `tools/list`, `tools/call`, capability negotiation) over Streamable HTTP,
which today it does **not** — see the correction in §2. That's a real new dependency
(`@modelcontextprotocol/sdk` or equivalent) and a new code surface to maintain, test, and
keep the schema honest for external callers who are not this codebase.

### 1b. AXON as a plain authenticated HTTP API

**Setup burden:** none beyond "have a URL and a token" — usable from `curl`, a GitHub Actions
step, a Python script, or a harness's own generic "fetch a URL" ability. This is strictly the
lowest floor: it works even from tools that have never heard of MCP, which crucially includes
**Hermes** — the README already states "Hermes stays separate — sync only, no LLM," meaning
Hermes is scripted cron/Actions work, not an LLM agent host with an MCP client at all. Hermes
cannot "attach an MCP server" in any meaningful sense; it can absolutely call an HTTP endpoint
with a bearer token from a workflow step. **For Hermes specifically, shape (b) is the only
shape that makes sense — MCP would add nothing it can use.**

**What a harness can actually do with it:** whatever the calling code was written to do —
nothing more. A human (or a pre-written script inside an agent's toolset) decides when to
call it; the harness's own LLM doesn't get "the AXON brain" as a tool it can reach for
autonomously unless someone hand-wires a custom tool/skill around the HTTP calls. Claude Code,
Antigravity, and VS Code-family tools *can* all shell out to `curl` or run a script that hits
the API, but that's a worse, more manual experience than a first-class MCP tool for the exact
same use case — the model isn't offered "call the AXON brain" as an available action; a human
has to tell it to run a specific curl command, or someone has to write a custom skill/tool
wrapper for each harness (which is real duplicated work, once per harness, and starts to
resemble MCP without its off-the-shelf client tooling).

**Real cost of this shape:** genuinely small. It's variations on endpoints this repo already
has — `app/api/axon/chat/route.ts` (session-cookie authed), `app/api/axon/guest-chat/route.ts`
(public, rate-limited, no brain access), and the existing `X-Match-Fit-Webhook-Secret`
shared-header pattern in `middleware.ts`/`app/api/axon/match-fit/*` are all real precedent for
"a new authenticated JSON endpoint, auth'd by something other than the dashboard session
cookie." The new work is mostly the auth layer (§3), not the endpoints themselves.

### Honest comparison

| | MCP server | Plain HTTP API |
|---|---|---|
| Setup burden per harness | Lowest for MCP-native tools — one config block | Lowest overall — works everywhere, including non-agentic tools |
| Reachable from Hermes | No (not an LLM/MCP host) | Yes — the only realistic option |
| Reachable from Claude Code / Antigravity / VS Code-family | Yes, natively, as a model-callable tool | Yes, but only via a hand-written script/skill per harness, or manual curl |
| New protocol surface to build/maintain | Yes — real MCP JSON-RPC server, new dependency | No — same Next.js route pattern already in this repo |
| Best user experience for an *agentic* harness | Best — model decides to call it mid-task | Worse — a human or a pre-written wrapper has to invoke it |
| Best fit for scripted automation (Hermes) | Poor fit / not applicable | Best fit |

**This is why "ship both, HTTP first" is the recommendation** rather than picking one: they
serve genuinely different callers (an autonomous coding agent vs. a cron job), and the HTTP
API is a strict subset of the work the MCP server needs anyway.

---

## 2. What "the AXON brain" concretely means as an exposed interface

Read directly from this repo, not guessed:

### Chat / generate (the router core)

- **`routeChat(supabaseKey, args)`** — `lib/axon-router-core.mjs`. The single entry point used
  by `/api/axon/chat` and `/api/axon/guest-chat` today. Classifies the message
  (`classifyCapability`), and for `capabilityClass === 'cheap_chat'` runs the **locked LLM
  chain** via `axonGenerate` (Decision #1721: local Mac mini → RunPod AXON v1 → OpenRouter free
  → Gemini → Anthropic, in that order, account keys before platform keys); for anything else
  it falls back to the capability-scored lane pool (`listCandidateLanes` + `scoreLanes` over
  `router_routes`/`router_models`/`router_health`/`axon_account_connectors`). This is the
  natural `axon_chat` / `axon_ask` MCP tool or `POST /api/external/chat` HTTP endpoint.
- **`axonGenerate(supabaseKey, opts)`** — same file. Plain-text generation only, no tool-calling,
  no agent boot context. This is the natural `axon_generate` tool for a harness that wants a
  cheap, fast, brain-flavored completion without the full chat/agent machinery.
- Both already log every attempt through `recordLlmUsage`/`axon_cost_ledger` and every routed
  decision through `axon_router_decisions` — an external call is auditable for free, with no
  new logging work, as long as the external caller's identity (which token/harness) is folded
  into the existing `agentName`/`meta` fields (see §3 — this is also how "which remote harness
  said what" gets answered later without a schema migration).
- **Not exposing (v1): `agentId`/`agentChain`/tool-calling.** `routeChat` also drives AXON's
  own internal agent-firing loop (`handleToolCall`, `fireAgent`, the FIRE/HOLD gate) when
  `agentId` is set. A remote harness should get chat/generate, not the ability to make AXON
  fire its own internal agents — that's a materially different, higher-risk capability and
  belongs in a later phase behind its own explicit decision (§5).

### Context / Decision / Learning reads ("the brain" proper)

- **`retrieveContextBeforeReason(supabaseKey, topic)`** — `lib/axon-retrieve-before-reason.mjs`.
  Free-text search across NI-Brain's `Learnings`, `Decisions`, `Context` tables (the same three
  tables every agent reads at boot per `AGENTS.md`), already summarized and capped. This is the
  natural shape for an `axon_search_brain` / `GET /api/external/brain/search?q=` — it already
  does exactly "give me relevant prior Learnings/Decisions/Context for X," which is the generic
  "read AXON's shared brain" ask.
- **`loadBootWisdom` / `formatBootWisdomBlock`** — `lib/axon-boot-wisdom.mjs`. Highest-salience
  rows from `axon_wisdom_items` (the absorbed output of the wisdom-absorb loop). Natural
  `axon_wisdom` tool/endpoint — read-only, already capped and formatted for prompt injection,
  so it's also directly usable as extra system-prompt context inside another harness (e.g. a
  Claude Code session pulling AXON's accumulated wisdom into its own system prompt via an MCP
  resource, not just a tool call).
- **`buildAgentBootContext(agentId)`** — `lib/axon-agent-boot.mjs`. Combines an agent's own
  instructions + live golden skills + `v_boot` rules row + authority row + last run + boot
  wisdom into one system-prompt block. This is AXON's own internal notion of "boot the brain
  for agent X" — **not** directly exposable as-is (it requires an `axon_venture_agents` row,
  i.e. an AXON-internal agent identity, which a remote human-driven coding harness doesn't
  have), but it's the reference shape for what a *new* "boot the brain for an external
  harness" function should return: live rules version, live golden-skill list, and a wisdom
  block, minus the agent-specific instructions/authority/previous-run fields that don't apply.

### Explicitly NOT "the brain" for this interface (adjacent, don't conflate)

- `nvg_skill_registry` (`scope='mcp'`) / `mcp-marketplace.tsx` / `app/api/axon-v0/mcp/supabase/route.ts`
  — this existing "MCP" code is AXON acting as an **MCP client**, connecting *outward* to other
  MCP servers (Supabase today) for its own use, tracked as UI rows in a skill registry. There
  is **no `@modelcontextprotocol/sdk` (or any MCP server library) in `package.json`** — AXON
  has never implemented the actual MCP server protocol. Anyone reading this repo's grep hits
  for "MCP" should not assume server-side MCP work already exists; it doesn't. This doc is
  about the opposite direction: other tools attaching *to* AXON.
- The Match Fit webhooks (`/api/axon/match-fit/*`) and the Telegram webhook are existing
  inbound integrations, but they're single-purpose, one-shot event receivers (a posting
  confirmation, a bot command) — not a general "ask AXON anything" surface. They're useful
  precedent for the auth pattern (§3), not something this interface extends.

---

## 3. Auth model — how a remote harness proves it's really JB

### What exists today

One shared secret, `AXON_DASHBOARD_SECRET`, is the *entire* authenticated surface of AXON
right now: it's the password typed at `/login`, and its value is written verbatim as the
session cookie (`lib/auth.ts`, `middleware.ts`) — there is no per-device, per-session, or
per-tool distinction once that cookie is set. Server-to-server callers (Match Fit) instead
use a completely separate shared-secret-per-integration pattern (`MATCH_FIT_WEBHOOK_SECRET`
as a header, whitelisted by path in `middleware.ts`).

### Why reusing `AXON_DASHBOARD_SECRET` directly for remote harnesses is the wrong move

- **No revocation granularity.** If JB pastes the same secret into Claude Code, Antigravity,
  VS Code, and a Hermes GitHub Actions secret, and one of those four leaks or one device is
  lost, the only fix is rotating the one secret everywhere — which also logs JB himself out of
  the dashboard until every harness is re-configured.
- **No scoping.** The dashboard secret currently gates *everything* behind the AXON UI. A
  coding harness asking "what did AXON decide about X" should not, by construction, be holding
  the same credential that (today or later) can also reach billing-adjacent or write surfaces.
- **No attribution.** `chosen_reason`/`agentName`/`meta` fields already make routing decisions
  greppable per caller (§2) — but only if each caller presents a distinct identity. One shared
  secret makes every remote call indistinguishable from JB's own dashboard session in the log.

### Recommendation: new, scoped, per-harness bearer tokens — built on the existing account model, not a new one

- **Reuse the account concept, not the raw secret.** AXON already has an account model
  (`accountId`, `PLATFORM_ACCOUNT_ID`, `axon_account_provider_keys`, `AXON_ACCOUNT_EMAILS`
  allowlist). A remote-harness token should be **a credential scoped to an account**, the same
  way a provider key is — not a second copy of the dashboard password.
- **Mint, don't share.** A new table (shape: `axon_external_tokens` — `account_id`, `label`
  e.g. "Claude Code — MacBook", `token_hash` (never plaintext, same posture as
  `axon_account_provider_keys`' AES-GCM-at-rest pattern, or a simple salted hash since these
  are bearer secrets the server itself generates rather than user-supplied provider keys),
  `scopes` (e.g. `chat`, `brain:read`; write scopes deliberately not modeled in v1 — see §2),
  `created_at`, `last_used_at`, `revoked_at`) lets JB (or later, another authorized account)
  generate one token per device/harness from the dashboard, see when it was last used, and
  revoke exactly one without touching the others or his own login.
- **Transport: `Authorization: Bearer <token>` header.** This is the one auth shape that is
  simultaneously: (a) what every MCP client surveyed in §1a already supports for a remote
  server out of the box (static header, `${ENV_VAR}` expansion, or an `inputs`-prompted
  secret), (b) trivial from `curl`/GitHub Actions/any HTTP client for Hermes, and (c) already
  the pattern this repo uses for provider keys and webhook secrets — no new mental model.
- **Don't build OAuth for v1.** It's the "more correct" long-term answer (per-harness consent,
  no long-lived bearer secret sitting in a config file) but Claude Code is the only harness in
  §1a with a solid OAuth story today; Antigravity's is actively broken; VS Code's `inputs`
  mechanism is closer to "prompt once, store a static secret" than real OAuth anyway. Static
  bearer tokens, generated and revocable server-side, get 90% of OAuth's safety (no shared
  secret, real revocation) with zero of its current cross-harness reliability risk.
- **Verify, don't trust the header blindly.** Every request still needs `token_hash` looked up,
  `revoked_at IS NULL` and (if used) scope-checked server-side before touching `routeChat` —
  the token proves *which* harness/device is calling, not that the call is automatically
  allowed to do everything JB's own session can.

This mirrors a pattern JB already runs elsewhere in his own stack (a long-lived, revocable,
scope-limited personal access token for remote/headless access to a system that otherwise
gates on an interactive login) — it's a small, already-familiar idea, not a new one.

---

## 4. Rough phased build plan (not built now)

**Phase 0 — this doc.** Scope only. Done by this PR.

**Phase 1 — plain HTTP API, read + chat only.**
- New table + minimal dashboard UI: mint/list/revoke `axon_external_tokens` (reuses the
  existing account model — no new auth *paradigm*, one new table).
- New auth middleware branch: `Authorization: Bearer <token>` accepted alongside the existing
  session-cookie check, on a new, narrow path prefix (e.g. `/api/external/*`) so it never
  widens what the cookie-gated dashboard paths accept.
- Endpoints: `POST /api/external/chat` (wraps `routeChat`), `POST /api/external/generate`
  (wraps `axonGenerate`), `GET /api/external/brain/search` (wraps
  `retrieveContextBeforeReason`), `GET /api/external/wisdom` (wraps `loadBootWisdom`).
- Attribution: token's `label`/id flows into `agentName`/`meta` on every `recordLlmUsage`/
  `axon_router_decisions` write — free, given §2's existing logging.
- Genuinely low risk: same route pattern as existing endpoints, no new protocol, easy to test
  and to kill quickly if something's wrong. **This alone unblocks Hermes**, and unblocks every
  other harness via a manual curl/script even before Phase 2 exists.
- Dependencies: none beyond the new token table. No new npm packages.

**Phase 2 — MCP server wrapping the Phase 1 API.**
- Add `@modelcontextprotocol/sdk` (new dependency — first real one for this repo), implement
  `initialize`/`tools/list`/`tools/call` over Streamable HTTP, at (likely) a new route like
  `/api/external/mcp`.
- Tools: `axon_chat`, `axon_generate`, `axon_search_brain`, `axon_wisdom` — thin pass-throughs
  to the Phase 1 handlers, same bearer-token auth (MCP's own header-based auth story per §1a
  maps directly onto the Phase 1 token).
- This is the part that makes Claude Code / Antigravity / VS Code-family attachment a
  one-line config instead of a hand-written script per harness.
- Genuinely harder than it looks: MCP's JSON-RPC framing, tool-schema correctness (external
  clients validate against the schema you publish, not against this repo's internal types),
  and connection lifecycle (reconnection, capability negotiation) are new muscle for this
  codebase. Budget real testing time against at least Claude Code (best-documented, most
  mature client) before trusting Antigravity/VS Code-family against it.
- Dependency: Phase 1 must already be solid — Phase 2 has no logic of its own to speak of if
  Phase 1's handlers are already correct.

**Phase 3 — the genuinely hard/open-ended stuff (do not start without a fresh decision):**
- Any write/agentic surface (approve outreach, fire an internal AXON agent, mutate NI-Brain)
  from a remote harness — this is a materially different risk class from read+chat and needs
  its own FIRE/HOLD-gate-equivalent design, not a scope bump on Phase 1/2's tokens.
- Per-harness rate limiting / cost governance distinct from the existing $20/mo dashboard cap
  — a remote coding agent calling `axon_generate` in a loop is a different cost-shape risk than
  a human typing in the dashboard.
- OAuth, if/when the harness ecosystem's remote-OAuth support (esp. Antigravity's) actually
  stabilizes — revisit, don't build now.
- Multi-account/multi-human exposure (today everything is implicitly JB via
  `PLATFORM_ACCOUNT_ID`/the email allowlist) if this is ever meant to serve more than JB.

---

## 5. Open questions for JB (not guessed at)

1. **Scope of v1 access:** read + chat only (this doc's default), or does JB want a remote
   coding harness to be able to trigger `axonGenerate` against paid tiers (Anthropic) too,
   from day one? That changes the cost-governance urgency in Phase 3.
2. **Per-harness or per-device tokens?** One token per tool (Claude Code, Antigravity, VS Code,
   Hermes — 4 tokens) or one per physical device (laptop + desktop + GH Actions runner, if
   JB runs the same tool on multiple machines)? Changes the token table's granularity and the
   revocation UX.
3. **Hermes's token lifetime:** Hermes runs unattended in GitHub Actions with no interactive
   login step. Is a long-lived static token (stored as a GH Actions secret, same posture as
   `MATCH_FIT_WEBHOOK_SECRET` today) acceptable for it specifically, or does JB want scheduled
   rotation even for a non-interactive caller?
4. **Where does this live — same Vercel deployment as the dashboard, or a separate
   endpoint/subdomain?** Keeping `/api/external/*` on the existing `workspace` Vercel project
   is the low-effort default; a separate deployment would isolate blast radius further but is
   real extra infra JB hasn't asked for.
5. **Is AXON-internal agent-firing (`agentId`, `handleToolCall`, FIRE/HOLD) ever meant to be
   reachable from a remote coding harness**, or is "the brain" permanently read+chat-only from
   outside AXON's own surfaces? This changes how much of Phase 3 is worth designing at all.
6. **Multi-account/multi-user intent:** is this exposure JB-only indefinitely, or should the
   token model be built from day one assuming other authorized NI accounts
   (`AXON_ACCOUNT_EMAILS`) will eventually mint their own external tokens too?

---

## Related

`lib/axon-router-core.mjs` · `lib/axon-retrieve-before-reason.mjs` · `lib/axon-boot-wisdom.mjs` ·
`lib/axon-agent-boot.mjs` · `lib/axon-account-keys.mjs` · `lib/axon-secrets.mjs` ·
`lib/axon-dashboard-gate.mjs` · `middleware.ts` · `docs/axon-cognitive-architecture.md`
(the Core/Personal split and opt-in-connector thinking this doc's auth model borrows from).
