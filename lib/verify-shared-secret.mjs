import { timingSafeEqual } from 'crypto';

/**
 * Fail-closed, timing-safe comparison for a shared-secret header/token/cookie check.
 *
 * SHARED-SECRET-FAIL-CLOSED-0914: multiple webhook/API gates in this repo independently
 * reimplemented "compare a request-supplied value against a server-side secret," and two
 * of them (api/telegram-webhook.js, lib/dashboard-api.mjs) got it backwards — returning
 * `true` (authorized) when the expected secret was unset, instead of `false`. A missing
 * secret must always mean "reject everything," never "let everyone in." This is the ONE
 * place that comparison lives now; callers should use this instead of writing their own.
 *
 * @param {unknown} provided - value from the request (header, query param, cookie)
 * @param {unknown} expected - the server-side secret to check against
 * @returns {boolean} true only if both are non-empty strings of equal length that match byte-for-byte
 */
export function verifySharedSecret(provided, expected) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    // Run a same-length timingSafeEqual anyway so a length mismatch doesn't take a
    // shorter/faster code path than a same-length mismatch would.
    timingSafeEqual(providedBuf, Buffer.alloc(providedBuf.length));
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}
