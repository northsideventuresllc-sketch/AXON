# AXON Omni Router — increment 1 (failover core)

Ticket: `AXON-OMNI-ROUTER-REBUILD-001` (priority 2). This is the FIRST increment, not the
full epic. Status below is accurate as of this commit — re-check `agent_dispatch` /
`Decisions` before assuming anything past this list is done.

## What shipped this increment

- `lib/omni-router.mjs`: `callWithFailover(system, user, opts)` — tries providers in
  priority order (`local` → `claude` → `gemini` by default), skips a provider on any
  thrown error or empty response, returns the first success plus a full attempt log
  (`{ text, provider, attempts: [{provider, ok, error?}] }`).
- `PROVIDERS` export: capability metadata (id, label, whether it needs an API key) for
  a future AXON Dash "which model answered" panel.
- Fully offline unit tests (`tests/omni-router.test.mjs`, `npm run test:omni-router`,
  5 cases, passing): primary success, real failover to backup, empty-response handling,
  all-providers-fail throws with every reason listed, unknown provider id in the order
  doesn't crash.
- Zero changes to `lib/ai.mjs` or `lib/axon-local-relay.mjs` — the existing outreach
  pipeline (`scanProspect`, `haikuScoreAndDraft`, etc) is untouched and carries zero
  regression risk from this change. `callWithFailover` calls the same local-relay
  helper (`callAxonLocal`) but is otherwise a new, independent, additive module.

## Explicitly NOT done yet (do not report as complete elsewhere)

- **DeepSeek and Cursor are not wired in.** `PROVIDERS`/the built-in callers only cover
  axon-local, Claude, and Gemini — the three the codebase already called somewhere.
  Adding DeepSeek/Cursor needs their real API shapes + keys, tracked as a follow-up.
- **No call sites migrated onto this router yet.** `lib/ai.mjs`'s outreach cascade and
  the `portal-integration/.../api/axon/dispatch/chat/route.ts` endpoint still use their
  own existing logic. Migrating them to `callWithFailover` is a separate increment —
  doing it here would have widened blast radius on live, working code.
- **No staged/canary release channel.** That's the separate `AXON-VERSION-STAGING-001`
  ticket.
- **No AXON Dash UI change.** This is the backend primitive only.

## Next increment (for whoever picks this ticket up next)

1. Add DeepSeek + Cursor callers to `BUILTIN_CALLERS` in `lib/omni-router.mjs`.
2. Migrate the `dispatch/chat` route to call `callWithFailover` instead of its current
   single-provider call, behind a feature flag so it can be reverted instantly.
3. Surface `attempts` in a Dash panel so JB can see which provider actually answered
   and how often failover is triggering in production.
