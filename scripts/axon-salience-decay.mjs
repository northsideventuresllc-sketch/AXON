#!/usr/bin/env node
/**
 * AX-SALIENCE-DECAY apply script (BPA-C2-BRAIN-GAPS-0906, part c).
 *
 * Reads `axon_wisdom_items` (status=absorbed), runs the pure decaySalience()
 * math from lib/axon-salience.mjs over them in batches, and PATCHes the
 * decayed salience back — via REST, same pattern as every other scripts/*.mjs
 * in this repo (lib/supabase.mjs's sbPatch is per-filter, not bulk, so this
 * uses the raw PostgREST client directly for batch PATCHes-by-id).
 *
 * DRY-RUN BY DEFAULT. Nothing is written unless --apply is passed. A dry run
 * prints exactly what would change (id, before -> after, age in days) and
 * exits 0 without touching the table.
 *
 * Follow-up (documented, not built here — see PR body): `last_reinforced_at`
 * is not yet a real column on axon_wisdom_items (checked live via
 * information_schema.columns, 2026-09-07). decaySalience() already falls back
 * to updated_at/absorbed_at/created_at when it's absent (see
 * lib/axon-salience.mjs's lastReinforcedMs), so this script runs correctly
 * today — but a real last_reinforced_at column, set by reinforceSalience() at
 * absorb/reinforce time, would make the decay clock reflect actual
 * reinforcement instead of "whenever the row was last touched for any
 * reason." Adding it is a schema migration — Hard Stop, needs JB
 * (nvg-operator-core Section 7) — so it stays a follow-up, not shipped here.
 *
 * Usage:
 *   node scripts/axon-salience-decay.mjs                 # dry run (default)
 *   node scripts/axon-salience-decay.mjs --apply          # writes decayed salience
 *   node scripts/axon-salience-decay.mjs --half-life=21    # override half-life days
 */
import { decaySalience, DEFAULT_SALIENCE_HALF_LIFE_DAYS } from '../lib/axon-salience.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const TABLE = 'axon_wisdom_items';
const BATCH_SIZE = 50;

const apply = process.argv.includes('--apply');
const halfLifeArg = process.argv.find((a) => a.startsWith('--half-life='));
const halfLifeDays = halfLifeArg ? Number(halfLifeArg.split('=')[1]) : DEFAULT_SALIENCE_HALF_LIFE_DAYS;

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function fetchAllRows(key) {
  const filter =
    `status=eq.absorbed&select=id,fingerprint,title,salience,last_reinforced_at,updated_at,absorbed_at,created_at&order=salience.desc`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${filter}`, {
    headers: { ...hdrs(key), Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`fetch ${TABLE}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

/** One-row-at-a-time PATCH by id — PostgREST has no bulk-update-by-id-list. */
async function patchRow(key, id, salience) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...hdrs(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ salience, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`patch ${TABLE} id=${id}: HTTP ${r.status} ${await r.text()}`);
}

async function main() {
  const key = getSupabaseKey();
  if (!key) {
    console.error('No SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY set — nothing to do.');
    process.exit(1);
  }

  const rows = await fetchAllRows(key);
  const decayed = decaySalience(rows, new Date(), halfLifeDays);

  const changed = decayed.filter((d, i) => d.decayed_from !== d.salience);

  console.log(
    `axon-salience-decay: ${rows.length} absorbed row(s), half-life=${halfLifeDays}d, ${changed.length} would change.`,
  );
  for (const row of changed.slice(0, 25)) {
    console.log(`  ${row.id}  ${row.decayed_from} -> ${row.salience}  "${(row.title || '').slice(0, 60)}"`);
  }
  if (changed.length > 25) {
    console.log(`  ...and ${changed.length - 25} more`);
  }

  if (!apply) {
    console.log('DRY RUN — nothing written. Pass --apply to write.');
    return;
  }

  let written = 0;
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const batch = changed.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map((row) => patchRow(key, row.id, row.salience)));
    written += batch.length;
  }
  console.log(`Applied: wrote decayed salience for ${written} row(s).`);
}

main().catch((err) => {
  console.error('axon-salience-decay failed:', err?.message || err);
  process.exit(1);
});
