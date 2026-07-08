import {
  claimResendDomain,
  createResendDomain,
  deleteResendDomain,
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

export async function syncResendDomain(apiKey, domainName, options = {}) {
  const { replaceExisting = false } = options;
  let domains = await listResendDomains(apiKey);
  const existing = domains.find((d) => d.name === domainName);

  if (existing) {
    const full = await getResendDomain(apiKey, existing.id);
    return {
      action: 'found',
      domain: summarizeDomain(full),
    };
  }

  async function freeSlotIfNeeded() {
    if (!replaceExisting) return false;
    domains = await listResendDomains(apiKey);
    const removable = domains.filter((d) => d.name !== domainName);
    if (!removable.length) return false;
    for (const d of removable) {
      await deleteResendDomain(apiKey, d.id);
    }
    return true;
  }

  async function registerDomain(replacedNames = []) {
    try {
      const created = await createResendDomain(apiKey, domainName);
      const full = await getResendDomain(apiKey, created.id);
      return {
        action: replacedNames.length ? 'replaced' : 'created',
        domain: summarizeDomain(full),
        replaced: replacedNames.length ? replacedNames : undefined,
      };
    } catch (err) {
      const parsed = parseResendDomainError(err);

      if (parsed.code === 'domain_other_team' || parsed.canClaim) {
        try {
          await claimResendDomain(apiKey, domainName);
          const refreshed = await refreshResendDomain(apiKey, domainName);
          if (!refreshed.domain) {
            throw new Error('Domain claim started but domain not found in Resend yet');
          }
          return {
            action: replacedNames.length ? 'claimed_after_replace' : 'claimed',
            domain: refreshed.domain,
            replaced: replacedNames.length ? replacedNames : undefined,
            notice: parsed.message,
          };
        } catch (claimErr) {
          const claimParsed = parseResendDomainError(claimErr);
          if (claimParsed.code === 'domain_plan_limit' && (await freeSlotIfNeeded())) {
            return registerDomain(domains.map((d) => d.name));
          }
          throw claimErr;
        }
      }

      if (parsed.code === 'domain_plan_limit') {
        if (await freeSlotIfNeeded()) {
          return registerDomain(domains.map((d) => d.name));
        }
        return {
          action: 'blocked',
          error: parsed.message,
          code: parsed.code,
          currentDomains: domains.map((d) => ({ name: d.name, status: d.status, id: d.id })),
          canReplace: true,
        };
      }

      throw err;
    }
  }

  return registerDomain();
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
        'Sending domain is not connected. Add your email under Outreach Channels — AXON will register it with Resend automatically.',
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

export async function ensureEmailCanSend(apiKey, fromEmail, options = {}) {
  const parsed = parseEmailAddress(fromEmail);
  if (parsed.error) return { ok: false, message: parsed.error };

  let sync = await refreshResendDomain(apiKey, parsed.domain);
  if (!sync.found) {
    sync = await syncResendDomain(apiKey, parsed.domain, options);
    if (sync.action === 'blocked') {
      return { ok: false, message: sync.error, code: sync.code, canReplace: sync.canReplace, currentDomains: sync.currentDomains };
    }
    if (!sync.domain) {
      return { ok: false, message: 'Failed to register domain with Resend' };
    }
  }

  const check = assertDomainReadyForSend(sync.domain);
  return { ...check, parsed, domain: sync.domain };
}
