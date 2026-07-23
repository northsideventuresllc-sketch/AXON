/**
 * AXON → Match Fit outbound actions for Telegram-triggered Approve / Delete / Rewrite.
 *
 * ⚠️ AUTH BLOCKER (documented, not papered over):
 * The Match Fit admin outreach routes these functions target are ALL gated by
 * `requireAdminSession()` — an admin session COOKIE (`ADMIN_SESSION_COOKIE`,
 * verified via `verifyAdminSessionToken`). There is currently NO shared-secret /
 * service-token variant of these routes, so a server-to-server call from AXON's
 * Telegram bot cannot authenticate. See the delivery report.
 *
 * This module is written to the auth shape Match Fit WOULD need to add — a header
 * `X-Match-Fit-Service-Token` checked against a `MATCH_FIT_SERVICE_TOKEN` shared secret,
 * plus a service-to-service variant of each route. Until that exists:
 *   - if MATCH_FIT_APP_URL or MATCH_FIT_SERVICE_TOKEN is unset → returns
 *     { ok: false, blocked: true, reason } and NEVER pretends the action happened.
 *   - if both are set → it makes the real call, but today's Match Fit routes will 401
 *     (cookie-gated), which surfaces as { ok: false, status: 401 } — again, no fake success.
 *
 * Route targets (all cookie-gated today):
 *   Approve → POST  {APP}/api/admin/outreach/dispatch/queue   { leadIds: [{ id, platform }] }
 *   Delete  → POST  {APP}/api/admin/outreach/leads/bulk-delete { platform, mode:"ids", ids:[id], deleteReason }
 *   Rewrite → PATCH {APP}/api/admin/outreach/leads/{id}         { platform, <copyField>: text }
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
      `Cannot ${action} from Telegram: Match Fit has no server-to-server auth for its ` +
      'admin outreach routes yet (they require an admin session cookie). Set MATCH_FIT_APP_URL + ' +
      'MATCH_FIT_SERVICE_TOKEN here AND add a matching X-Match-Fit-Service-Token gate on the ' +
      'Match Fit side before this will work.',
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
  return callMatchFit('POST', '/api/admin/outreach/leads/bulk-delete', {
    platform,
    mode: 'ids',
    ids: [leadId],
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
      'This is expected until a service-token auth path exists on the Match Fit routes.';
  }
  return `The ${verb} for ${label} failed: ${result?.error || 'unknown error'}.`;
}
