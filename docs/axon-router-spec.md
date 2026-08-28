# AXON Multi-Route Router — Build Spec

- **What this is:** one router for internal AXON traffic. Five providers, automatic failover, pin-one-model when you want it.
- **Costs you:** nothing. Match Fit and ReplyFlow keep their existing paid path, untouched.
- **Time:** one day. Must-ship core is named in §8; everything else is cuttable.
- **One thing to know:** the Mac mini has **3.7 GB free disk** — not enough to pull more local models until that's cleared.

**Scope:** internal AXON v0 traffic only.
**Repo:** `/Users/jonnybooth/axon`, branch `feat/axon-computer-use-routing`.

---

## 0. Conventions

**Tiers are ranked integers.** Ordering must be comparable in SQL, so tiers are stored as a rank, not a string set.

| Tier | Rank | Example models |
|---|---|---|
| `frontier` | 4 | claude-opus-5, claude-sonnet-5, gemini-2.5-pro |
| `capable` | 3 | gemini-2.5-flash, deepseek/deepseek-v4-flash |
| `free` | 2 | OpenRouter `:free` models |
| `local` | 1 | axon-llama (3B), axon-ornith (9B) |

**Tier is a property of the (route, model) pair — never of the route alone.** `gemini-api` serves both frontier (2.5-pro) and capable (2.5-flash); the router must never treat those as interchangeable.

**Route names:** `claude-cli`, `anthropic-api`, `gemini-api`, `openrouter`, `ollama-local`.

```
lib/axon-router/
  index.mjs            # walk() — public entry point
  walker.mjs           # candidate selection + fallback loop
  classify.mjs         # failure taxonomy
  health.mjs           # NI-Brain read/write
  adapters/
    index.mjs          # name -> send() registry
    claude-cli.mjs  anthropic-api.mjs  gemini-api.mjs
    openrouter.mjs  ollama-local.mjs   errors.mjs
```

---

## 1. Adapter layer

One exported function per adapter. No classes.

```js
export async function send(request) { /* -> AdapterResponse */ }
```

**Request:** `{ prompt, model, maxTokens?, timeoutMs?, systemPrompt? }`

**Success:**
```js
{ ok: true, text, route, model,
  usage: { inputTokens, outputTokens },  // null where provider omits
  latencyMs, raw }                       // raw = debug only; router must not depend on it
```

**Failure — adapters never throw for expected failures:**
```js
{ ok: false, route, errorType, httpStatus?, message, raw }
// errorType: "transport" | "http" | "provider" | "timeout"
```

- `transport` — connection refused, DNS, spawn failure. No response reached.
- `http` — non-2xx with a status code.
- `provider` — 2xx but error in body (content filter, etc).
- `timeout` — the adapter's own timer fired.

**The registry.** `adapters/index.mjs` exports `{ [routeName]: { send } }`. The walker's helper is exactly:

```js
// callAdapter is a thin resolver — this is the whole definition
async function callAdapter(routeName, model, payload) {
  return adapters[routeName].send({ ...payload, model });
}
```

**Per-adapter quirks:**

- **claude-cli** — `execFile` (not `exec`, avoids shell-escaping the prompt): `claude -p "<prompt>" --output-format json`. Text from `result`. No API key — uses JB's logged-in CLI session. **~31k tokens fixed overhead per call** plus process-spawn latency; route here only when quality outweighs cost. Non-zero exit and JSON-parse failure are distinct transport failures.
- **anthropic-api** — POST `api.anthropic.com/v1/messages`, `x-api-key` header, `anthropic-version` required. Text from `content[0].text`.
- **gemini-api** — POST `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`. **Key goes in the query string, not a header.** Text from `candidates[0].content.parts[0].text`; usage from `usageMetadata` (different field names — normalize explicitly).
- **openrouter** — OpenAI-compatible POST `https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer`. Text from `choices[0].message.content`. A bad model id is a runtime 400, not a config error.
- **ollama-local** — POST `http://localhost:11434/api/generate`, no auth. Connection-refused (daemon down) maps to `transport`, never `provider`.

---

## 2. Adding a new provider later

Three steps, no redesign:

1. Write `lib/axon-router/adapters/<name>.mjs` exporting `send(request)` per §1.
2. Register it in `adapters/index.mjs`.
3. Insert one `router_routes` row and one `router_models` row per model you want reachable.

Nothing else changes. Keys go in `ni_platform_secrets` and are referenced by name.

---

## 3. NI-Brain schema

Three tables. **No health row = healthy** — a `router_health` row exists only for a (route, model) currently failing or cooling off, so 380 OpenRouter models never explode the table.

```sql
create table router_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,     -- 'claude-cli' | 'anthropic-api' | 'gemini-api' | 'openrouter' | 'ollama-local'
  kind text not null check (kind in ('subprocess','api','local')),
  secret_key text references ni_platform_secrets(key),  -- null for claude-cli (subscription, no key)
  base_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tier lives HERE, per model. This is what makes the tier floor real.
create table router_models (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id) on delete cascade,
  model text not null,           -- exact provider model id, sent verbatim to the adapter
  tier_rank int not null check (tier_rank between 1 and 4),  -- 4=frontier 3=capable 2=free 1=local
  priority int not null default 100,  -- lower = preferred among equals
  enabled boolean not null default true,
  unique (route_id, model)
);
create index idx_router_models_pick on router_models (tier_rank desc, priority asc) where enabled;

create table router_health (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references router_routes(id) on delete cascade,
  model text not null default '',   -- '' = route-wide (a dead key kills every model behind it)
  status text not null default 'healthy' check (status in ('healthy','rate_limited','dead')),
  reason text,                      -- '429_upstream_congestion', '401_invalid_key', 'quota_exhausted'
  failure_count int not null default 0,
  backoff_seconds int not null default 0,
  retry_after timestamptz,          -- set ONLY for 'rate_limited'; self-clears past this time
  last_success_at timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (route_id, model)
);
create index idx_router_health_lookup on router_health (route_id, model);
create index idx_router_health_retry on router_health (status, retry_after) where status = 'rate_limited';
```

**Temporary vs terminal is queryable.** `rate_limited` has `retry_after` set and self-clears. `dead` has `retry_after IS NULL` and stays until a human clears it. Nothing auto-clears `dead`.

**RLS:** not needed. Internal agent traffic, service-role only.

### Candidate selection — returns (route, model) pairs, ranked

`$1` = required tier rank. `>=` gives "or higher" natively; no array games.

```sql
select r.name as route, m.model, m.tier_rank
from router_models m
join router_routes r on r.id = m.route_id
left join router_health hr on hr.route_id = r.id and hr.model = ''
left join router_health hm on hm.route_id = r.id and hm.model = m.model
where r.enabled and m.enabled
  and m.tier_rank >= $1
  and coalesce(hr.status,'healthy') <> 'dead'
  and coalesce(hm.status,'healthy') <> 'dead'
  and (hr.retry_after is null or hr.retry_after <= now())
  and (hm.retry_after is null or hm.retry_after <= now())
order by m.tier_rank desc, m.priority asc;
```

### Health writes

Backoff schedule 30s → 2m → 10m → 30m, as an explicit lookup so it matches §5 exactly:

```sql
-- mark (route, model) rate-limited; failure_count is read pre-increment
insert into router_health (route_id, model, status, reason, failure_count, backoff_seconds, retry_after, last_failure_at)
values ($1, $2, 'rate_limited', $3, 1,
        (array[30,120,600,1800])[1],
        now() + ((array[30,120,600,1800])[1] || ' seconds')::interval, now())
on conflict (route_id, model) do update set
  status = 'rate_limited',
  reason = excluded.reason,
  failure_count = router_health.failure_count + 1,
  backoff_seconds = (array[30,120,600,1800])[least(router_health.failure_count + 1, 4)],
  retry_after = now() + ((array[30,120,600,1800])[least(router_health.failure_count + 1, 4)] || ' seconds')::interval,
  last_failure_at = now(), updated_at = now();

-- mark terminal (route-wide: model = '')
insert into router_health (route_id, model, status, reason, retry_after)
values ($1, '', 'dead', $2, null)
on conflict (route_id, model) do update set
  status = 'dead', reason = excluded.reason, retry_after = null, updated_at = now();

-- success: clear
insert into router_health (route_id, model, status, failure_count, backoff_seconds, retry_after, last_success_at)
values ($1, $2, 'healthy', 0, 0, null, now())
on conflict (route_id, model) do update set
  status = 'healthy', failure_count = 0, backoff_seconds = 0,
  retry_after = null, last_success_at = now(), updated_at = now();
```

**Which key does a failure write to?** A failure tied to credentials (401/402/403) writes route-wide (`model = ''`). Everything else writes to the specific `(route_id, model)`.

---

## 4. Failure classifier

| Outcome | Class |
|---|---|
| 200 + well-formed body | **SUCCESS** |
| 200 + malformed/empty body | TRANSIENT |
| 401 | **TERMINAL** — credentials revoked |
| 402 | **TERMINAL** — credits exhausted |
| 403 | **TERMINAL** — banned, or model gated to a tier not held |
| 429 **with** quota/billing text (`insufficient_quota`, `exceeded your current quota`, `monthly limit`, `billing`) | **TERMINAL** |
| 429 **all other cases** (incl. `Provider returned error`) | TRANSIENT |
| 5xx | TRANSIENT |
| timeout (60s default, 120s claude-cli) | TRANSIENT |
| network failure | TRANSIENT |
| claude-cli non-zero exit | TRANSIENT, unless stderr matches auth/billing (`login required`, session expired) → TERMINAL |

**An ambiguous 429 defaults to TRANSIENT.** Only explicit quota/billing language promotes it. This is the common case — live test on a zero-usage OpenRouter account had **3 of 6** free models return upstream 429 from shared-pool congestion (a 4th failed 403, tier-gated). See §9.

---

## 5. The walker

```js
walk({ requiredTier?, payload, pinnedRoute?, pinnedModel?, allowDegraded? })
```

### Defaults — how `requiredTier` gets set

`requiredTier` is **optional** and resolves to `capable` (rank 3) when omitted. It is never inferred from the pin — inferring it would compare the pin's tier to itself and the floor check could never fail.

**Implementation note — this is load-bearing.** Capture whether the caller passed a tier **before** substituting the default:

```js
const tierWasExplicit = requiredTier !== undefined;   // MUST come first
requiredTier ??= 'capable';
```

Thread `tierWasExplicit` through all three decision points — the bare-vs-conflicting pin split, auto step 6, and step 7. **Never re-derive it from the resolved value.** After defaulting, `requiredTier === 'capable'` is indistinguishable from a caller who explicitly wrote `'capable'`, and a naive `if (tier === 'capable')` check would send an explicitly-demanded `capable` call into step 7 and hand back a degraded local answer — breaking the one guarantee §6 makes.

**Why `capable` and not `frontier`:**

- Most internal AXON traffic is **ordinary chat and job work**.
- Defaulting to `frontier` would push all of it onto **Opus / 2.5-pro** and burn the subscription and API budget.
- Callers who need top-tier reasoning **ask for it**: `walk({ requiredTier: 'frontier', … })`.

**`callChatModel` (§7)** passes no tier, so it gets `capable`. On the **day-1 seed** (§8) that means Claude Sonnet 5, Claude Opus 5 and Gemini 2.5-pro at frontier, Gemini 2.5-flash at capable, and `axon-ornith`/`axon-llama` reachable via step 7. DeepSeek v4-flash, the OpenRouter free pool and `claude-cli` join as day-2 rows.

### Two kinds of below-floor pin — treated differently on purpose

| Case | Behavior |
|---|---|
| **Bare pin** — pinned, no explicit `requiredTier` | **Permitted.** Pinning is itself the explicit choice; there is no stated requirement to violate. Returns normally, but **always** with `requestedTier: 'capable'` (the default), `servedTier` = the pin's real tier, and `degraded: true` when the pin sits below it. No flag needed. |
| **Conflicting pin** — explicit `requiredTier` *above* the pinned model's tier | **Refused** with `pinned_below_floor`, unless `allowDegraded: true`. The caller stated two contradictory things; the router will not silently pick one. |

**Why the split:** a bare pin is an operator saying "use this one" — refusing it would be the router second-guessing a deliberate choice. A conflicting pin is a caller demanding frontier quality *and* naming a 3B model; that contradiction must surface.

**Reporting is identical either way.** A `local`-tier answer always reports `servedTier: 'local'` and `degraded: true`, whether it arrived by bare pin or by explicit opt-in. Two calls that deliver the same capability never report differently.

### Pinned mode — "stick with one"

Triggered by `pinnedRoute` and/or `pinnedModel`.

1. Resolve the pinned pair. Apply the below-floor table above: bare pin → permitted; conflicting pin → `{ status: "pinned_below_floor", requiredTier, pinnedTier, route, model }` unless `allowDegraded: true`.
2. If the pair is `dead` or cooling off → `{ status: "pinned_unavailable", route, model, reason }`.
3. Call it once. Classify. Write health.
4. Return the result — success or failure — always carrying `servedTier`, `requestedTier`, `degraded`.

**No fallback to other routes, ever.** A pinned call that fails returns that failure. That is the whole point of "stick with one".

### Auto mode — "choose like Cursor"

1. Run the §3 selection query at `requiredTier`'s rank. Result: an ordered list of **(route, model) pairs** — the model string comes from here, which is what the adapter needs.
2. Order is computed **once**. Never re-scored mid-walk.
3. Pop next pair → `callAdapter(route, model, payload)`.
4. Classify:
   - **SUCCESS** → return, reporting `servedTier` / `requestedTier` / `degraded`.
   - **TERMINAL** → write `dead` (route-wide for credential errors, else per-model), advance.
   - **TRANSIENT** → write backoff, advance.
5. Repeat until the list is exhausted.
6. Exhausted → go to step 7 (last resort) if the tier was **defaulted**, or return `tier_floor_failure` if it was **explicitly demanded**. See §6.

### Step 7 — last resort (default-tier calls only)

**This is what makes "never run out of usage" true.**

- Applies **only** when the caller did *not* pass `requiredTier` (i.e. it defaulted to `capable`).
- Re-run selection at rank 1 (`local`) and walk the results the same way.
- **Why this doesn't re-attempt what already failed:** the rank-1 query returns *all* tiers, but steps 4–5 have already written `dead` or `retry_after` health rows for every higher-tier pair just tried, so the query's own health filters exclude them. Only the `free` and `local` pairs survive. The tier filter alone is not what makes this work — the health writes are.
- Any answer from this stage returns `degraded: true` with `degradationPath` listing everything tried above it.
- Only when this stage is also exhausted does the call fail.

**Why this is safe:** a defaulted tier means nobody stated a correctness requirement, so a flagged local answer beats no answer. An **explicit** `requiredTier: 'frontier'` never reaches step 7 — a caller who demanded frontier gets a clean failure instead of a quiet 3B substitution.

---

## 6. Tier floor — the safety property

**An explicitly demanded tier is never silently downgraded.**

Within a walk, the selection query only returns pairs at `tier_rank >= requiredTier`, so lower tiers are **not candidates at all**. Because tier lives on the (route, model) pair, `gemini-api` cannot pass a frontier gate and then serve `gemini-2.5-flash`.

**The floor is strict exactly when someone asked for it.**

| Call | On exhaustion |
|---|---|
| **Explicit** `requiredTier` (e.g. `'frontier'`) | `{ status: "tier_floor_failure", requiredTier, attemptedPairs, reason }` — a clean **error**, never a lower-tier answer. A wrong answer from a 3B model at 3am is worse than no answer. |
| **Defaulted** tier (caller said nothing) | Falls to §5 step 7 — free, then local — returning `degraded: true`. Nobody stated a requirement, so a flagged answer beats a failure. |

**`allowDegraded` has one job:** permitting a deliberate below-floor **pin** (§5). It has no effect in auto mode — auto mode's behavior is decided by whether the tier was explicit, not by a flag.

**Degradation is never silent.** Every response carries `servedTier`, `requestedTier`, and when they differ, `degraded: true` plus `degradationPath` (ordered list of what was tried and why each failed).

**Per-attempt logging:** timestamp, route, model, requiredTier, httpStatus/exit code, classification, latencyMs, first 500 chars of response body, cooldown applied. The full walk must be reconstructable from logs alone.

---

## 7. AXON integration

**Today:** one function, `callChatModel` (`lib/axon-web-chat.ts:93`), runs a hardcoded chain — axon-local → RunPod (dead no-op) → Gemini (2 keys) → Haiku. It is the single funnel every non-fixed, non-computer-use AXON reply passes through.

**The seam:** `callChatModel` becomes a thin wrapper calling `walk()` — **no explicit tier passed**, so it resolves to `capable` per §5 Defaults, with step-7 last resort available. `agent-chat/route.ts` does not change. `routeFixedIfAssigned` (`lib/axon-v0/omni-router.ts:84-104`) is left alone — operator-configured BYO is a separate contract from JB's pinning, which is now handled inside `walk()`.

| File:line | When |
|---|---|
| `lib/axon-web-chat.ts:30,50,93` (`callHaiku`, `callGeminiOnce`, `callChatModel`) | **Now** — this is the seam |
| `lib/axon-v0/omni-router.ts:19,36,63` | **Never this cut** — fixed BYO path |
| `lib/axon-computer-use-router.ts:22` | Later — cheap, latency-sensitive |
| `lib/axon-computer-use.mjs:192` | **Never this cut** — needs tool-aware routing (`computer_toolset_20260801`) |
| `app/api/axon/dispatch/chat/route.ts:10,35` | Later — same shape |
| `lib/axon-telegram-chat.mjs:43,68` | Later |
| `lib/axon-research-core.mjs:100,120`, `axon-research-synthesis.mjs:25,46`, `axon-self-research-build-plans.mjs:156,186` | Later — good second wave |
| `lib/wisdom-absorb-loop.mjs:333,391` | Later |
| `lib/ai.mjs:40,60`, `lib/local-model-daily.mjs:172` | **Never this cut** — `ai.mjs` callers UNVERIFIED |
| `portal-integration/**` | **Never** — mirrors to the customer-facing portal repo |

**Internal/external boundary — a path allowlist, not a flag.** Flags get flipped by accident; imports don't. `lib/axon-router/` may be imported only from `app/api/axon-v0/**`, `app/api/axon/**`, and internal `lib/axon-*` job files. Never from `app/api/axon/match-fit/**`, `app/api/axon/guest-chat/**`, or `portal-integration/**`. Enforce with a CI grep that fails loud.

**FIRE/HOLD:** the router is **not** gated by it. `lib/axon-fire-gate-core.mjs:82-92` gates outbound irreversible actions (outreach, dispatch, cron, publish). Choosing which model answers an internal chat is neither. Per-route disable lives in `router_routes.enabled` — no redeploy.

---

## 8. Build order — what must ship, what can slip

**Must ship today (the core loop):**

1. Three tables + seed rows. **The seed is load-bearing** — with no `router_models` rows at rank ≥ 3, every default call returns zero candidates and fails instantly:

```sql
insert into router_routes (name, kind, secret_key, base_url) values
  ('anthropic-api','api',  'ANTHROPIC_API_KEY', null),
  ('gemini-api',   'api',  'GEMINI_API_KEY',    null),
  ('ollama-local', 'local', null, 'http://localhost:11434');

insert into router_models (route_id, model, tier_rank, priority)
select r.id, m.model, m.rank, m.prio from router_routes r
join (values
  ('anthropic-api','claude-sonnet-5',    4, 10),
  ('anthropic-api','claude-opus-5',      4, 20),
  ('gemini-api',   'gemini-2.5-pro',     4, 30),
  ('gemini-api',   'gemini-2.5-flash',   3, 10),
  ('ollama-local', 'axon-ornith:latest', 1, 10),
  ('ollama-local', 'axon-llama:latest',  1, 20)
) as m(route,model,rank,prio) on m.route = r.name;
```

**`ollama-local` is in the must-ship set on purpose.** It is the only route that can never rate-limit or run out, so it is what §5 step 7 actually reaches. Cutting it would leave the last-resort floor as dead code.

Day-2 routes add rows the same way — OpenRouter `:free` at rank 2, `deepseek/deepseek-v4-flash` at rank 3, `claude-cli` at rank 4.
2. `adapters/anthropic-api.mjs`, `adapters/gemini-api.mjs`, `errors.mjs`, `adapters/index.mjs`.
3. `classify.mjs`, `health.mjs`, `walker.mjs` (auto mode + tier floor).
4. Wrap `callChatModel` behind `walk()`, old chain retained behind the rollback flag.

5. **Pinned mode** (§5) — JB asked for "sticking with one" by name, and it is a small branch at the top of `walk()` that skips the selection query entirely. Ship it.

**Cuttable to day 2 if time runs short:**

- `openrouter` and `claude-cli` adapters (add rows + files; no core changes)
- Degradation reporting beyond a boolean flag

**Do NOT cut `ollama-local`.** It is the only route that cannot rate-limit or run out, so it is the thing step 7 reaches. Cut it and the last-resort floor becomes dead code — the walk still hard-fails when Anthropic and Gemini are both throttled, which is the exact scenario this router exists to survive.
- CI import-boundary grep
- Degradation reporting beyond a boolean flag

**Rollback:** `AXON_ROUTER_DISABLED=1` checked at the top of `callChatModel`, restoring the old chain verbatim. Keep the old chain commented, not deleted, for exactly this reason. Env flip + restart — don't trust a misbehaving router's own config path to disable itself.

---

## 9. Live baseline (measured 2026-08-28)

- OpenRouter free tier: **2 of 6** models responded — 3× upstream 429, 1× 403 tier-gated (2+3+1 = 6). Account had **zero** prior usage.
  - Passed: `minimax/minimax-m3:free`, `nvidia/nemotron-3-super-120b-a12b:free`
  - 429: `z-ai/glm-5.2:free`, `google/gemma-4-31b-it:free`, `liquid/lfm-2.5-2.6b:free`
  - 403: `thinkingmachines/inkling:free` (paid tier only)
- OpenRouter: 380 models, 18 free. GLM is **5.2** (not 5.3), free, rate-limited on both attempts.
- DeepSeek v4-flash: **$0.06/M** — the cheap workhorse, not free-tier, so it avoids the shared-pool 429 problem.
- `claude -p` headless: works, Opus 5, 1M context, ~31k tokens overhead, 2.8s round trip.
- Gemini key: valid, 50 models. Local: axon-llama (3B), axon-ornith (9B).
