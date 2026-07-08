#!/usr/bin/env node
/**
 * Bootstrap Resend domain for outreach email.
 * Usage:
 *   node scripts/setup-resend-domain.mjs jb@northsideintelligence.com
 *   node scripts/setup-resend-domain.mjs --replace 'JB <jb@northsideintelligence.com>'
 */
import { loadConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import {
  parseEmailAddress,
  refreshResendDomain,
  syncResendDomain,
  triggerDomainVerification,
} from '../lib/email-domain-sync.mjs';
import { listResendDomains } from '../lib/resend-domains.mjs';

const args = process.argv.slice(2);
const replaceExisting = args.includes('--replace');
const emailArg = args.find((a) => !a.startsWith('--')) || 'JB <jb@northsideintelligence.com>';

async function resolveResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const { sbSelect } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);
  return cfg.resendKey || null;
}

async function main() {
  const parsed = parseEmailAddress(emailArg);
  if (parsed.error) {
    console.error('❌', parsed.error);
    process.exit(1);
  }

  const resendKey = await resolveResendKey();
  if (!resendKey) {
    console.error('❌ RESEND_API_KEY not configured');
    process.exit(1);
  }

  console.log(`Connecting ${parsed.formatted} (domain: ${parsed.domain})…`);

  const before = await listResendDomains(resendKey);
  console.log('Current Resend domains:', before.map((d) => `${d.name} (${d.status})`).join(', ') || 'none');

  const sync = await syncResendDomain(resendKey, parsed.domain, { replaceExisting });
  if (sync.action === 'blocked') {
    console.error('\n❌', sync.error);
    console.error('Current domains:', sync.currentDomains);
    console.error('\nRe-run with --replace to swap the existing domain for', parsed.domain);
    process.exit(1);
  }

  console.log(`\n✓ Action: ${sync.action}`);
  if (sync.replaced?.length) {
    console.log('  Replaced:', sync.replaced.join(', '));
  }

  const domain = sync.domain;
  console.log(`  Domain: ${domain.name}`);
  console.log(`  Status: ${domain.status}`);
  console.log(`  ID: ${domain.id}`);

  if (domain.records?.length) {
    console.log('\nDNS records (add at your domain host):');
    for (const r of domain.records) {
      console.log(`  [${r.type}] ${r.name}${r.priority != null ? ` (prio ${r.priority})` : ''} → ${r.value}`);
    }
  }

  if (domain.status !== 'verified') {
    console.log('\nTriggering verification check…');
    await triggerDomainVerification(resendKey, parsed.domain);
    const refreshed = await refreshResendDomain(resendKey, parsed.domain);
    console.log('  Status after check:', refreshed.domain?.status || 'unknown');
  } else {
    console.log('\n✓ Domain already verified — ready to send.');
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
