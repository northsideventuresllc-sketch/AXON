/**
 * AXON → Match Fit outbound actions for Telegram-triggered Approve / Delete / Rewrite.
 *
 * Match Fit's outreach admin routes now accept EITHER an admin session cookie OR a
 * shared-secret header `X-Match-Fit-Service-Token` (checked against
 * `MATCH_FIT_SERVICE_TOKEN`) — this module calls them the service-token way.
 *   - if MATCH_FIT_APP_URL or MATCH_FIT_SERVICE_TOKEN is unset here → returns
 *     { ok: false, blocked: true, reason } and NEVER pretends the action happened.
 *   - if both are set but wrong/mismatched with the Match Fit side's value → the call
 *     genuinely 401s, surfaced as { ok: false, status: 401 } — no fake success either way.
 *
 * Route targets:
 *   Approve → POST   {APP}/api/admin/outreach/dispatch/queue { leadIds: [{ id, platform }] }
 *   Delete  → DELETE {APP}/api/admin/outreach/leads/{id}       { platform, deleteReason }
 *             (NOT bulk-delete — its where-clause only matches pre-hub leads, savedToHubAt:null;
 *             every lead Telegram shows is already hub-saved, so bulk-delete would silently no-op)
 *   Rewrite → PATCH  {APP}/api/admin/outreach/leads/{id}       { platform, <copyField>: text }
 */

const SERVICE_TOKEN_HEADER = 'X-Match-Fit-Service-Token';

/** Copy field a Rewrite should overwrite, per platform (matches leads/[id] PATCH schema). */
const REWRITE_FIELD = {
  instagram: 'dmText',
  facebook: 'pagePostText',
  email: 'emailBody',
};

function serviceConfig() {
  const appUrl = process.env.MATCH_FIT_APP_URL?.trim().replace(/\/+$/, '');
  const token = process.env.MATCH_FIT_SERVICE_TOKEN?.trim();
  return { appUrl, token };
}

function blocked(action) {
  return {
    ok: false,
    blocked: true,
    reason:
      `Cannot ${action} from Telegram yet: MATCH_FIT_APP_URL and/or MATCH_FIT_SERVICE_TOKEN ` +
      'are not set in this AXON deployment. Set both here (the token must match the value ' +
      'configured as MATCH_FIT_SERVICE_TOKEN on the Match Fit side) to enable this action.',
  };
}

async function callMatchFit(method, path, body) {
  const { appUrl, token } = serviceConfig();
  if (!appUrl || !token) return null; // caller converts to blocked()
  let res;
  try {
    res = await fetch(`${appUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        [SERVICE_TOKEN_HEADER]: token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    return { ok: false, status: res.status, body: text.slice(0, 300) };
  }
  return { ok: true, status: res.status, body: text.slice(0, 300) };
}

export async function approveOutreachLead({ platform, leadId }) {
  const { appUrl, token } = serviceConfig();
  if (!appUrl || !token) return blocked('approve');
  return callMatchFit('POST', '/api/admin/outreach/dispatch/queue', {
    leadIds: [{ id: leadId, platform }],
  });
}

export async function deleteOutreachLead({ platform, leadId, reason }) {
  const { appUrl, token } = serviceConfig();
  if (!appUrl || !token) return blocked('delete');
  // bulk-delete's where-clause only matches savedToHubAt:null (pre-hub leads) — every
  // lead visible in Telegram is already hub-saved, so DELETE /leads/{id} is the only
  // path that actually archives a hub lane lead. Do not switch this back to bulk-delete.
  return callMatchFit('DELETE', `/api/admin/outreach/leads/${encodeURIComponent(leadId)}`, {
    platform,
    deleteReason: reason?.trim() || 'Deleted from Telegram by JB',
  });
}

export async function rewriteOutreachLead({ platform, leadId, text }) {
  const { appUrl, token } = serviceConfig();
  if (!appUrl || !token) return blocked('rewrite');
  const field = REWRITE_FIELD[platform] || 'dmText';
  return callMatchFit('PATCH', `/api/admin/outreach/leads/${encodeURIComponent(leadId)}`, {
    platform,
    [field]: text,
  });
}

/** Turn an action result into a short, honest Telegram reply string. */
export function describeActionResult(verb, label, result) {
  if (result?.ok) {
    return `Done — ${verb}d ${label} in Match Fit.`;
  }
  if (result?.blocked) {
    return (
      `Couldn't ${verb} ${label} yet. ${result.reason}`
    );
  }
  if (result?.status) {
    return `Match Fit rejected the ${verb} for ${label} (HTTP ${result.status}). ` +
      'Check MATCH_FIT_SERVICE_TOKEN matches on both sides, or the request body shape.';
  }
  return `The ${verb} for ${label} failed: ${result?.error || 'unknown error'}.`;
}
