# Last verified sync run (A4)

Record of the one real (non-`--check`) run of `scripts/sync-portal-ui.mjs` performed
while fixing the missing-`LIB_FILES` drift (A4). This directory is NOT read by the sync
script — `portal-integration/northside-intelligence/` is the actual overlay source the
script reads from, and writing a full mirror into it would corrupt that (the script
would try to re-sync its own output back into itself on the next run). This is just the
audit record the ticket asked for.

- Ran against a disposable local copy of `northside-intelligence` (not the shared
  checkout, and never pushed) after expanding `LIB_FILES` from 49 to 69 entries and
  landing the A3 cron-catalog changes (which touch `cron-jobs-panel.tsx`, one of the
  mirrored `COMPONENT_FILES`).
- Re-verified at `b47f340` after merging `main` (PR #178's cron-parser extraction +
  PR #179's `axon-generate.mjs`), which added 3 more required `LIB_FILES` entries
  (`axon-cron-parser-core.mjs`, `axon-cron-catalog-core.mjs`, `axon-generate.mjs`) —
  found by `scripts/check-portal-sync-imports.mjs` against the merged tree.
- `--check` first, against the real (shared, read-only) checkout, at commit
  `b47f340`: `Plan checked: 184 write(s), 0 breaking removals.`
- Real run, against the disposable copy: same result, 184 files written, 0 breaking
  removals, manifest above.
- `manifest.json` here is a copy of what the run wrote to
  `<niRoot>/src/lib/axon/.axon-sync-manifest.json` — proof of which AXON commit was
  last verified to sync clean.

What the NI side still needs after this AXON PR merges: an actual run of
`node scripts/sync-portal-ui.mjs /path/to/real/northside-intelligence` from a checkout
of `main` (post-merge), committed and pushed there via the normal
`sync-ni-portal.yml` workflow or by hand — this AXON PR does not push to
northside-intelligence.
