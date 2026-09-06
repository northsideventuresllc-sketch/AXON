# Last verified sync run (A4)

Record of the one real (non-`--check`) run of `scripts/sync-portal-ui.mjs` performed
while fixing the missing-`LIB_FILES` drift (A4). This directory is NOT read by the sync
script — `portal-integration/northside-intelligence/` is the actual overlay source the
script reads from, and writing a full mirror into it would corrupt that (the script
would try to re-sync its own output back into itself on the next run). This is just the
audit record the ticket asked for.

- Ran against a disposable local copy of `northside-intelligence` (not the shared
  checkout, and never pushed) after expanding `LIB_FILES` from 49 to 66 entries and
  landing the A3 cron-catalog changes (which touch `cron-jobs-panel.tsx`, one of the
  mirrored `COMPONENT_FILES`).
- `--check` first, against the real (shared, read-only) checkout, at commit
  `dcc3e87` (A3 committed, before this A4 commit): `Plan checked: 181 write(s),
  0 breaking removals.`
- Real run, against the disposable copy: same result, 181 files written, 0 breaking
  removals, manifest above.
- `manifest.json` here is a copy of what the run wrote to
  `<niRoot>/src/lib/axon/.axon-sync-manifest.json` — proof of which AXON commit was
  last verified to sync clean.

What the NI side still needs after this AXON PR merges: an actual run of
`node scripts/sync-portal-ui.mjs /path/to/real/northside-intelligence` from a checkout
of `main` (post-merge), committed and pushed there via the normal
`sync-ni-portal.yml` workflow or by hand — this AXON PR does not push to
northside-intelligence.
