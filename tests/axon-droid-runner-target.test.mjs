#!/usr/bin/env node
/**
 * Proves lib/axon-droid-runner-target.mjs's stub routing seam: live_session resolves (today's
 * only real runner, unchanged behavior), ghost_desktop fails closed with a clear message
 * instead of silently falling back or no-op'ing, and an unknown target is rejected.
 *
 * Run: node tests/axon-droid-runner-target.test.mjs
 */
import assert from 'node:assert/strict';
import { resolveRunnerTarget, RUNNER_TARGETS } from '../lib/axon-droid-runner-target.mjs';

// --- 1. No opts / explicit live_session both resolve to today's only real runner -----------
{
  assert.equal(resolveRunnerTarget(), RUNNER_TARGETS.LIVE_SESSION);
  assert.equal(
    resolveRunnerTarget({ requestedTarget: RUNNER_TARGETS.LIVE_SESSION }),
    RUNNER_TARGETS.LIVE_SESSION
  );
}

// --- 2. ghost_desktop fails closed, not a silent fallback -----------------------------------
{
  assert.throws(
    () => resolveRunnerTarget({ requestedTarget: RUNNER_TARGETS.GHOST_DESKTOP }),
    /ghost_desktop is not implemented yet/
  );
}

// --- 3. An unrecognized target is rejected, not defaulted -----------------------------------
{
  assert.throws(
    () => resolveRunnerTarget({ requestedTarget: 'some_unknown_target' }),
    /unknown runner target/
  );
}

console.log('axon-droid-runner-target.test.mjs OK');
