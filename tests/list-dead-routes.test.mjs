#!/usr/bin/env node
/**
 * A8 — asserts scripts/list-dead-routes.mjs finds zero dead API routes.
 * Run: node tests/list-dead-routes.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { findDeadRoutes } from '../scripts/list-dead-routes.mjs';

test('no API routes have zero callers in the repo', () => {
  const dead = findDeadRoutes();
  assert.deepEqual(
    dead,
    [],
    `expected no dead routes, found: ${JSON.stringify(dead, null, 2)}`,
  );
});
