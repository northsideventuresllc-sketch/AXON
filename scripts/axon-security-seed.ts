#!/usr/bin/env node
/**
 * Seed default AXON master operator security record (operator_id=default, display_name=JB).
 * Passcode is hashed at runtime — never stored in git.
 *
 * Usage: node --experimental-strip-types scripts/axon-security-seed.ts
 */
import { initDefaultOperatorSecurity } from '../lib/axon-security';

async function main() {
  console.log(`AXON security seed — ${new Date().toISOString()}`);

  const row = await initDefaultOperatorSecurity();
  console.log(`Seeded operator: ${row.operator_id} (${row.display_name})`);
  console.log(`Lockout phase: ${row.lockout_phase}, tries remaining: ${row.tries_remaining_in_phase}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('AXON security seed failed:', err.message);
  process.exit(1);
});
