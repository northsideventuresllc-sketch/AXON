const RESEND_BASE = 'https://api.resend.com';

async function parseJson(r) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function resendRequest(apiKey, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${RESEND_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseJson(r);
  if (!r.ok) {
    const err = new Error(data.message || `Resend HTTP ${r.status}`);
    err.status = r.status;
    err.name = data.name || 'resend_error';
    err.data = data;
    throw err;
  }
  return data;
}

export async function listResendDomains(apiKey) {
  const result = await resendRequest(apiKey, '/domains');
  return result.data || [];
}

export async function getResendDomain(apiKey, domainId) {
  return resendRequest(apiKey, `/domains/${domainId}`);
}

export async function createResendDomain(apiKey, name, region = 'us-east-1') {
  return resendRequest(apiKey, '/domains', {
    method: 'POST',
    body: { name, region },
  });
}

export async function deleteResendDomain(apiKey, domainId) {
  return resendRequest(apiKey, `/domains/${domainId}`, { method: 'DELETE' });
}

export async function verifyResendDomain(apiKey, domainId) {
  return resendRequest(apiKey, `/domains/${domainId}/verify`, { method: 'POST' });
}

export async function claimResendDomain(apiKey, name) {
  return resendRequest(apiKey, '/domains/claim', {
    method: 'POST',
    body: { name },
  });
}

export function normalizeDnsRecords(records = []) {
  return records.map((record) => ({
    record: record.record || record.type,
    type: record.type,
    name: record.name,
    value: record.value,
    priority: record.priority ?? null,
    status: record.status || 'not_started',
    ttl: record.ttl || null,
  }));
}

export function summarizeDomain(domain) {
  if (!domain) return null;
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status || 'not_started',
    region: domain.region || 'us-east-1',
    records: normalizeDnsRecords(domain.records || []),
    createdAt: domain.created_at || null,
  };
}

export function isDomainVerified(status) {
  return status === 'verified' || status === 'partially_verified';
}

export function parseResendDomainError(err) {
  const message = err?.message || String(err);
  if (message.includes('registered to another team')) {
    return {
      code: 'domain_other_team',
      message:
        'This domain is on another Resend account. AXON can start a domain claim — add the TXT record shown below, then verify.',
      canClaim: true,
    };
  }
  if (message.includes('plan includes') || message.includes('Upgrade to add more')) {
    return {
      code: 'domain_plan_limit',
      message:
        'This Resend API key is for a different product (e.g. Match Fit). Set RESEND_API_KEY_NI to the NORTHSiDE Intelligence Resend account key for outreach email.',
      canReplace: false,
    };
  }
  if (message.includes('not verified')) {
    return {
      code: 'domain_not_verified',
      message: 'Domain DNS is not verified yet. Add the records below and AXON will keep checking.',
      canVerify: true,
    };
  }
  return { code: 'resend_error', message };
}
