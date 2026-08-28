// lib/axon-router/classify.mjs
//
// Failure taxonomy per axon-router-spec.md §4.
//
// classifyOutcome(adapterResult) -> { class: 'SUCCESS'|'TRANSIENT'|'TERMINAL', reason }
//
// adapterResult is whatever an adapter's send() returned (§1):
//   success: { ok: true, text, route, model, usage, latencyMs, raw }
//   failure: { ok: false, route, errorType, httpStatus?, message, raw }

const QUOTA_BILLING_PATTERNS = [
  /insufficient_quota/i,
  /exceeded your current quota/i,
  /monthly limit/i,
  /billing/i,
  // Anthropic's exact wording when a key has no credit (arrives as a 400).
  // /billing/i already catches its "Plans & Billing" tail, but match the
  // primary phrase directly so classification does not depend on that.
  /credit balance is too low/i,
  /no longer available/i,
];

const AUTH_BILLING_STDERR_PATTERNS = [
  /login required/i,
  /session expired/i,
];

function hasQuotaBillingText(...parts) {
  const haystack = parts.filter(Boolean).join(' \n ');
  if (!haystack) return false;
  return QUOTA_BILLING_PATTERNS.some((re) => re.test(haystack));
}

function hasAuthBillingText(...parts) {
  const haystack = parts.filter(Boolean).join(' \n ');
  if (!haystack) return false;
  return AUTH_BILLING_STDERR_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Classify the outcome of a single adapter call per §4's table.
 *
 * @param {object} adapterResult - the raw return value of adapters[route].send()
 * @returns {{ class: 'SUCCESS'|'TRANSIENT'|'TERMINAL', reason: string }}
 */
export function classifyOutcome(adapterResult) {
  if (!adapterResult || typeof adapterResult !== 'object') {
    return { class: 'TRANSIENT', reason: 'malformed_adapter_result' };
  }

  // ---- SUCCESS -------------------------------------------------------
  if (adapterResult.ok === true) {
    const text = adapterResult.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return { class: 'SUCCESS', reason: '200_ok' };
    }
    // 200 + malformed/empty body -> TRANSIENT
    return { class: 'TRANSIENT', reason: 'empty_or_malformed_body' };
  }

  // ---- FAILURE ---------------------------------------------------------
  const { errorType, httpStatus, message, raw } = adapterResult;

  // claude-cli non-zero exit / transport failures
  if (errorType === 'transport') {
    const rawStderr =
      (raw && (raw.stderr || raw.stdErr || raw.error)) || undefined;
    if (hasAuthBillingText(message, rawStderr)) {
      return { class: 'TERMINAL', reason: 'cli_auth_or_billing_failure' };
    }
    return { class: 'TRANSIENT', reason: 'transport_failure' };
  }

  if (errorType === 'timeout') {
    return { class: 'TRANSIENT', reason: 'timeout' };
  }

  if (errorType === 'provider') {
    // 2xx but error in body (content filter, etc) -> treat like the
    // ambiguous case unless it carries explicit quota/billing text.
    if (hasQuotaBillingText(message, raw && JSON.stringify(raw))) {
      return { class: 'TERMINAL', reason: 'provider_quota_or_billing' };
    }
    return { class: 'TRANSIENT', reason: 'provider_error' };
  }

  if (errorType === 'http') {
    const status = Number(httpStatus);

    if (status === 401) {
      return { class: 'TERMINAL', reason: '401_invalid_key' };
    }
    if (status === 402) {
      return { class: 'TERMINAL', reason: '402_credits_exhausted' };
    }
    if (status === 403) {
      return { class: 'TERMINAL', reason: '403_banned_or_tier_gated' };
    }
    // Anthropic returns 400 (not 402) when the credit balance is exhausted —
    // observed live 2026-08-28: {"type":"invalid_request_error","message":"Your
    // credit balance is too low to access the Anthropic API"}. Without this,
    // a dead key is classified TRANSIENT and retried forever on a 30s cycle.
    // Only promote when the body actually carries quota/billing text; a plain
    // 400 is a malformed request and stays TRANSIENT.
    if (status === 400) {
      const body400 =
        (raw && (typeof raw === 'string' ? raw : JSON.stringify(raw))) || '';
      if (hasQuotaBillingText(message, body400)) {
        return { class: 'TERMINAL', reason: '400_credits_or_billing' };
      }
      return { class: 'TRANSIENT', reason: '400_bad_request' };
    }
    // 404 on a model id means the model is retired or not available to this
    // account (observed: gemini-2.5-pro "no longer available to new users").
    // Retrying cannot fix it — the row needs changing, so surface it as dead.
    if (status === 404) {
      return { class: 'TERMINAL', reason: '404_model_unavailable' };
    }
    if (status === 429) {
      const bodyText =
        (raw && (typeof raw === 'string' ? raw : JSON.stringify(raw))) ||
        '';
      if (hasQuotaBillingText(message, bodyText)) {
        return { class: 'TERMINAL', reason: '429_quota_or_billing' };
      }
      // Ambiguous 429 defaults to TRANSIENT — this is the common case.
      return { class: 'TRANSIENT', reason: '429_upstream_congestion' };
    }
    if (status >= 500 && status <= 599) {
      return { class: 'TRANSIENT', reason: `${status}_server_error` };
    }
    // Any other unexpected non-2xx: default to TRANSIENT — do not
    // silently promote to TERMINAL without explicit evidence.
    return { class: 'TRANSIENT', reason: `http_${status || 'unknown'}` };
  }

  // Unknown errorType — fail safe to TRANSIENT rather than TERMINAL.
  return { class: 'TRANSIENT', reason: `unknown_error_type_${errorType}` };
}

export default classifyOutcome;
