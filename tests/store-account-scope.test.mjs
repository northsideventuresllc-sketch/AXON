#!/usr/bin/env node
/**
 * Guards the bug that shipped on 2026-08-28 and was caught by an independent verifier,
 * not by CI.
 *
 * The v0 tables were created and seeded, which made tableLive() start returning true.
 * store.ts then stopped falling through to seedMem() and began querying the real tables
 * — but 7 of its 10 account-scoped functions were still filtering on a hardcoded
 * placeholder account id that matches no row. Result: listVentures() returned an EMPTY
 * ARRAY. The harness would have rendered zero ventures, which is worse than the in-memory
 * fallback it replaced.
 *
 * tsc and the router test both passed while this was broken, because neither one ever
 * asked the store for a venture. This test does.
 *
 * Run: node tests/store-account-scope.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../lib/axon-v0/store.ts', import.meta.url), 'utf8');

// 1. No account-scoped query may interpolate the dead placeholder.
const badFilter = /account_id=eq\.\$\{ACCOUNT_ID(?!_FALLBACK)/;
const badInsert = /account_id:\s*ACCOUNT_ID(?!_FALLBACK)/;
assert.ok(!badFilter.test(src), 'a query still filters on the placeholder account id');
assert.ok(!badInsert.test(src), 'an insert still writes the placeholder account id');

// 2. Every account-scoped site must route through the resolver.
const viaResolver = (src.match(/account_id(?:=eq\.\$\{|:\s*)await accountId\(\)/g) || []).length;
assert.ok(
  viaResolver >= 7,
  `expected >=7 account-scoped sites via accountId(), found ${viaResolver}`,
);

// 3. The resolver must exist and prefer the real row over the fallback.
assert.ok(/async function accountId\(\)/.test(src), 'accountId() resolver is missing');
assert.ok(
  /\(await getAccount\(\)\)\?\.id \?\? ACCOUNT_ID_FALLBACK/.test(src),
  'accountId() must resolve the real account and only then fall back',
);

// 4. The fallback must stay clearly marked as dead, so nobody reuses it as a real id.
assert.ok(
  /matches NO row in axon_accounts/.test(src),
  'the fallback constant must stay documented as matching no row',
);

console.log('store-account-scope: all 4 checks passed');
