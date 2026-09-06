/**
 * Pure decision logic for the AXON dashboard's auth gate, extracted out of middleware.ts
 * so it is testable with plain `node --test` — no Next.js edge runtime required.
 *
 * AX-DASHBOARD-SECRET-OWN-0906: when AXON_DASHBOARD_SECRET is unset, the gate must refuse
 * (503) rather than silently accept a derived fallback secret. See lib/axon-secrets.mjs.
 */

/**
 * @param {object} args
 * @param {string|null|undefined} args.secret - AXON_DASHBOARD_SECRET, or null/undefined if unset
 * @param {string|null|undefined} args.sessionCookie - the request's session cookie value
 * @returns {{ outcome: 'secret_not_configured' } | { outcome: 'unauthenticated' } | { outcome: 'authenticated' }}
 */
export function evaluateDashboardAuth({ secret, sessionCookie }) {
  if (!secret) {
    return { outcome: 'secret_not_configured' };
  }
  if (sessionCookie !== secret) {
    return { outcome: 'unauthenticated' };
  }
  return { outcome: 'authenticated' };
}
