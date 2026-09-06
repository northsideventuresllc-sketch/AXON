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

/**
 * Pure decision for POST /api/auth/login — extracted (as plain .mjs, no `next/headers`
 * import, so it loads under plain `node --test`) so the fix for the AX-DASHBOARD-SECRET-
 * OWN-0906 follow-up regression (council PR #177 review) is directly unit-testable.
 *
 * The bug: the login route used to set the session cookie to `getDashboardSecret()` — which
 * became env-only after the first pass of this ticket — while `validateLogin()` could still
 * succeed on a live NI-Brain-sourced code even with the env secret unset. That let a login
 * "succeed" while writing a null/broken cookie, which middleware.ts then 503'd the entire
 * dashboard on for every subsequent request.
 *
 * The fix: the session cookie has exactly ONE source — `envSecret` (read via
 * lib/axon-secrets.mjs). `loginResult` (from lib/auth.ts's validateLogin, which still
 * accepts a live NI-Brain-sourced code as a valid login *credential* so JB can rotate it
 * without a redeploy) only ever gates whether a cookie gets set — it never supplies the
 * cookie's value. When envSecret is null there is nothing valid to set as a cookie, so this
 * refuses with a plain-English 503 before even considering loginResult.
 *
 * @param {string|null|undefined} envSecret - AXON_DASHBOARD_SECRET via lib/axon-secrets.mjs's tryGetDashboardSecret()
 * @param {{ok: true} | {ok: false, reason: 'code' | 'email'}} loginResult - lib/auth.ts's validateLogin() result
 * @returns {
 *   {status: 503, setCookie: false, body: {error: string}} |
 *   {status: 401, setCookie: false, body: {error: string}} |
 *   {status: 200, setCookie: true, cookieValue: string, body: {ok: true}}
 * }
 */
export function decideLoginResponse(envSecret, loginResult) {
  if (!envSecret) {
    return { status: 503, setCookie: false, body: { error: 'Dashboard secret is not configured' } };
  }
  if (!loginResult.ok) {
    const error =
      loginResult.reason === 'email'
        ? 'That email is not on the AXON account list.'
        : 'That AXON code does not match.';
    return { status: 401, setCookie: false, body: { error } };
  }
  return { status: 200, setCookie: true, cookieValue: envSecret, body: { ok: true } };
}
