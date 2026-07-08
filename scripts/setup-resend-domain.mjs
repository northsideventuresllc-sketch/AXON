#!/usr/bin/env node
/**
 * Bootstrap Resend domain for NI outreach email (NI Resend account only — not Match Fit).
 * Usage: RESEND_API_KEY_NI=... node scripts/setup-resend-domain.mjs 'JB <jb@northsideintelligence.com>'
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

const emailArg = process.argv[2] || 'JB <jb@northsideintelligence.com>';

async function resolveResendKey() {
  if (process.env.RESEND_API_KEY_NI) return process.env.RESEND_API_KEY_NI;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return process.env.RESEND_API_KEY || null;
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
    console.error('❌ Set RESEND_API_KEY_NI to the NORTHSiDE Intelligence Resend account (not Match Fit)');
    process.exit(1);
  }

  console.log(`Connecting ${parsed.formatted} on NI Resend account (domain: ${parsed.domain})…`);

  const before = await listResendDomains(resendKey);
  console.log('Domains on this key:', before.map((d) => `${d.name} (${d.status})`).join(', ') || 'none');

  if (before.some((d) => d.name === 'match-fit.net')) {
    console.error('\n❌ This API key is the Match Fit Resend account. Use RESEND_API_KEY_NI for NI outreach.');
    process.exit(1);
  }

  const sync = await syncResendDomain(resendKey, parsed.domain);
  if (sync.action === 'blocked') {
    console.error('\n❌', sync.error);
    process.exit(1);
  }

  console.log(`\n✓ Action: ${sync.action}`);
  const domain = sync.domain;
  console.log(`  Domain: ${domain.name} · ${domain.status}`);

  if (domain.records?.length) {
    console.log('\nDNS records:');
    for (const r of domain.records) {
      console.log(`  [${r.type}] ${r.name} → ${r.value}`);
    }
  }

  if (domain.status !== 'verified') {
    await triggerDomainVerification(resendKey, parsed.domain);
    const refreshed = await refreshResendDomain(resendKey, parsed.domain);
    console.log('  Status after check:', refreshed.domain?.status || 'unknown');
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
