// Registry check must match axon_cron_jobs ids against the relabeled roster
// (platform no longer says "axon" for jobs that moved to the mini / pg_cron).
import assert from 'node:assert/strict';
import { diffRegistry, routineKeys } from '../lib/axon-arceus-core.mjs';

const routines = [
  { agent_name: 'AXON-Spend-Guard', routine_id: null, platform: 'nvg_mini', active: true, health_status: 'healthy', wake_config: { source_workflow: 'axon-spend-guard.yml' } },
  { agent_name: 'hermes-nightly-sync', routine_id: null, platform: 'nvg_mini', active: true, health_status: 'stale', wake_config: { source_workflow: 'hermes-nightly-sync.yml' } },
  { agent_name: 'AXON-ATEB-Advance', routine_id: 'axon-ateb-advance', platform: 'nvg_mini', active: true, health_status: 'archived', wake_config: {} },
  { agent_name: 'AXON-Comm-Skill', routine_id: 'axon-comm-skill', platform: 'axon_local', active: true, health_status: 'stale', wake_config: {} },
];
const cronJobs = [
  { id: 'axon-spend-guard', enabled: true },
  { id: 'hermes-nightly-sync', enabled: true },
  { id: 'axon-ateb-advance', enabled: false },
];

assert.deepEqual([...routineKeys(routines[0])].sort(), ['axon-spend-guard'].sort());
assert.ok(routineKeys(routines[2]).has('axon-ateb-advance'));

const { findings } = await diffRegistry({ cronJobs, routines, ghToken: '', timeBudgetMs: 1000 });
const ids = findings.map((f) => f.id).sort();
// matched by source_workflow → no missing_in_routines for the two live jobs
assert.ok(!ids.includes('missing_in_routines:axon-spend-guard'), ids.join(','));
assert.ok(!ids.includes('missing_in_routines:hermes-nightly-sync'), ids.join(','));
// archived roster row does not count as a match
assert.ok(ids.includes('missing_in_routines:axon-ateb-advance'), ids.join(','));
// axon-platform row with no cron history is still flagged; mini rows are not
assert.ok(ids.includes('missing_in_cron:axon-comm-skill'), ids.join(','));
assert.ok(!ids.some((i) => i === 'missing_in_cron:hermes-nightly-sync'), ids.join(','));
console.log('arceus-registry-roster-match.test.mjs: all assertions passed');
