---
id: R-LRNB-002
title: Preserve the operator guard when syncing AXON routes into NI portal
type: reference
priority: should
scope:
  agents: [BUILD]
  ventures: [axon, ni]
  harnesses: [ALL]
triggers: [portal-integration, sync-portal-ui, AXON API route, operator guard, NI portal overlay]
source: "Learning #8268, #8275"
version: 1
updated: 2026-09-24
status: active
---
AXON keeps two copies of each portal API route: the plain `app/api/axon/**` (behind AXON's
own login) and a guarded overlay under `portal-integration/.../src/app/api/**` that the sync
writes last and NI portal actually serves. Mirroring the plain copy into NI silently drops
the operator check. After any `scripts/sync-portal-ui.mjs` run, verify the overlay endpoints
still 401 anonymous requests before calling the sync done.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
