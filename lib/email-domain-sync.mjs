import {
  claimResendDomain,
  createResendDomain,
  getResendDomain,
  isDomainVerified,
  listResendDomains,
  parseResendDomainError,
  summarizeDomain,
  verifyResendDomain,
} from './resend-domains.mjs';

/** Parse "Name <email@domain.com>" or bare address. */
export function parseEmailAddress(input) {
  const raw = String(input || '').trim();
  if (!raw) return { error: 'Email is required' };

  const bracket = raw.match(/^(.+?)\s*<([^>]+)>$/);
  const address = (bracket ? bracket[2] : raw).trim().toLowerCase();
  const displayName = bracket ? bracket[1].trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { error: 'Enter a valid email (e.g. JB <jb@northsideintelligence.com>)' };
  }

  const domain = address.split('@')[1];
  return { displayName, address, domain, formatted: displayName ? `${displayName} <${address}>` : address };
}

/**
 * Register or refresh a domain on the given Resend account.
 * Never deletes other domains — Match Fit and NI use separate Resend accounts.
 */
export async function syncResendDomain(apiKey, domainName) {
  const domains = await listResendDomains(apiKey);
  const existing = domains.find((d) => d.name === domainName);

  if (existing) {
    const full = await getResendDomain(apiKey, existing.id);
    return {
      action: 'found',
      domain: summarizeDomain(full),
    };
  }

  try {
    const created = await createResendDomain(apiKey, domainName);
    const full = await getResendDomain(apiKey, created.id);
    return {
      action: 'created',
      domain: summarizeDomain(full),
    };
  } catch (err) {
    const parsed = parseResendDomainError(err);

    if (parsed.code === 'domain_other_team' || parsed.canClaim) {
      await claimResendDomain(apiKey, domainName);
      const refreshed = await refreshResendDomain(apiKey, domainName);
      if (!refreshed.domain) {
        throw new Error('Domain claim started but domain not found in Resend yet');
      }
      return {
        action: 'claimed',
        domain: refreshed.domain,
        notice: parsed.message,
      };
    }

    if (parsed.code === 'domain_plan_limit') {
      return {
        action: 'blocked',
        error:
          'This Resend API key already has a different domain. AXON outreach must use the NORTHSiDE Intelligence Resend account — set RESEND_API_KEY_NI (not the Match Fit key).',
        code: parsed.code,
        currentDomains: domains.map((d) => ({ name: d.name, status: d.status, id: d.id })),
      };
    }

    throw err;
  }
}

export async function refreshResendDomain(apiKey, domainName) {
  const domains = await listResendDomains(apiKey);
  const existing = domains.find((d) => d.name === domainName);
  if (!existing) {
    return { found: false, domain: null };
  }
  const full = await getResendDomain(apiKey, existing.id);
  return { found: true, domain: summarizeDomain(full) };
}

export async function triggerDomainVerification(apiKey, domainName) {
  const refreshed = await refreshResendDomain(apiKey, domainName);
  if (!refreshed.found || !refreshed.domain?.id) {
    return { ok: false, error: 'Domain not registered in Resend yet' };
  }
  await verifyResendDomain(apiKey, refreshed.domain.id);
  const full = await getResendDomain(apiKey, refreshed.domain.id);
  return { ok: true, domain: summarizeDomain(full) };
}

export function assertDomainReadyForSend(domainSummary) {
  if (!domainSummary) {
    return {
      ok: false,
      message:
        'Sending domain is not connected. Add your email under Outreach Channels — AXON will register it on the NI Resend account automatically.',
    };
  }
  if (!isDomainVerified(domainSummary.status)) {
    return {
      ok: false,
      message: `Domain ${domainSummary.name} is not verified yet (${domainSummary.status}). Add the DNS records shown in Outreach Channels, then click Check verification.`,
      domain: domainSummary,
    };
  }
  return { ok: true, domain: domainSummary };
}

export async function ensureEmailCanSend(apiKey, fromEmail) {
  const parsed = parseEmailAddress(fromEmail);
  if (parsed.error) return { ok: false, message: parsed.error };

  let sync = await refreshResendDomain(apiKey, parsed.domain);
  if (!sync.found) {
    sync = await syncResendDomain(apiKey, parsed.domain);
    if (sync.action === 'blocked') {
      return {
        ok: false,
        message: sync.error,
        code: sync.code,
        currentDomains: sync.currentDomains,
      };
    }
    if (!sync.domain) {
      return { ok: false, message: 'Failed to register domain with Resend' };
    }
  }

  const check = assertDomainReadyForSend(sync.domain);
  return { ...check, parsed, domain: sync.domain };
}
