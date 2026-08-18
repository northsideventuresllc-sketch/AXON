# AXON Omni Router — increment 1 + 2 (failover core + DeepSeek)

Ticket: `AXON-OMNI-ROUTER-REBUILD-001` (priority 2). Not the full epic yet. Status below is
accurate as of this commit — re-check `agent_dispatch` / `Decisions` before assuming
anything past this list is done.

## What shipped, increment 1

- `lib/omni-router.mjs`: `callWithFailover(system, user, opts)` — tries providers in
  priority order (`local` → `claude` → `gemini` by default), skips a provider on any
  thrown error or empty response, returns the first success plus a full attempt log
  (`{ text, provider, attempts: [{provider, ok, error?}] }`).
- `PROVIDERS` export: capability metadata (id, label, whether it needs an API key) for
  a future AXON Dash "which model answered" panel.
- Zero changes to `lib/ai.mjs` or `lib/axon-local-relay.mjs` — the existing outreach
  pipeline (`scanProspect`, `haikuScoreAndDraft`, etc) is untouched and carries zero
  regression risk from this change. `callWithFailover` calls the same local-relay
  helper (`callAxonLocal`) but is otherwise a new, independent, additive module.

## What shipped, increment 2 (this commit)

- `callDeepSeek()` added to `lib/omni-router.mjs` + registered in `BUILTIN_CALLERS` and
  `PROVIDERS` (OpenAI-compatible `POST https://api.deepseek.com/chat/completions`,
  `DEEPSEEK_API_KEY` env var, default model `deepseek-chat`).
- **Deliberately NOT added to `DEFAULT_ORDER`.** No live call site uses this module yet
  (see increment 1's "not done" list, still true), so widening the default has zero
  production effect either way — left out to keep the diff minimal and reviewable. A
  caller opts in with `opts.order: [...DEFAULT_ORDER, 'deepseek']`.
- **Cursor is explicitly a non-goal, not a dropped task.** Cursor has no server-side
  completions API — it's an IDE product; its agent mode runs inside the editor, not as
  a hostable HTTP endpoint this router could call. Nothing to wire in.
- Offline unit tests (`tests/omni-router.test.mjs`, `node tests/omni-router.test.mjs`,
  now 6 cases, all passing): the 5 increment-1 cases plus a 6th proving `deepseek` is a
  real `BUILTIN_CALLERS` entry (reaches the real "DEEPSEEK_API_KEY missing" guard, not
  the generic "no caller registered" path) — with zero real network calls.
- No key configured for `DEEPSEEK_API_KEY` in `ni_platform_secrets` as of this commit —
  the code path is live and tested but unusable in production until JB adds a key. Not
  a blocker for shipping the code; flagged here so it isn't assumed live.

## Explicitly NOT done yet (do not report as complete elsewhere)

- **No call sites migrated onto this router yet.** `lib/ai.mjs`'s outreach cascade and
  the `portal-integration/.../api/axon/dispatch/chat/route.ts` endpoint still use their
  own existing logic. Migrating them to `callWithFailover` is a separate increment —
  doing it here would have widened blast radius on live, working code.
- **No staged/canary release channel.** That's the separate `AXON-VERSION-STAGING-001`
  ticket.
- **No AXON Dash UI change.** This is the backend primitive only.
- **No DeepSeek API key provisioned** (see above) — code is ready, key is not.

## Next increment (for whoever picks this ticket up next)

1. Get a `DEEPSEEK_API_KEY` into `ni_platform_secrets` (JB action — not a Hard Stop to
   ask him for a key, but BUILD cannot generate one).
2. Migrate the `dispatch/chat` route to call `callWithFailover` instead of its current
   single-provider call, behind a feature flag so it can be reverted instantly.
3. Surface `attempts` in a Dash panel so JB can see which provider actually answered
   and how often failover is triggering in production.
