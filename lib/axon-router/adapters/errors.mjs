// lib/axon-router/adapters/errors.mjs
//
// Constructors for the normalized adapter error shape (spec §1):
//   { ok: false, route, errorType, httpStatus?, message, raw }
//
// errorType: "transport" | "http" | "provider" | "timeout"
// Adapters never throw for expected failures — they return one of these.

/** connection refused, DNS failure, spawn failure — no response reached. */
export function makeTransportError({ route, message, raw = null }) {
  return {
    ok: false,
    route,
    errorType: 'transport',
    message,
    raw,
  };
}

/** non-2xx with a status code. */
export function makeHttpError({ route, httpStatus, message, raw = null }) {
  return {
    ok: false,
    route,
    errorType: 'http',
    httpStatus,
    message,
    raw,
  };
}

/** 2xx but error in body (content filter, malformed/empty body, etc). */
export function makeProviderError({ route, message, raw = null }) {
  return {
    ok: false,
    route,
    errorType: 'provider',
    message,
    raw,
  };
}

/** the adapter's own timer fired. */
export function makeTimeoutError({ route, message, raw = null }) {
  return {
    ok: false,
    route,
    errorType: 'timeout',
    message,
    raw,
  };
}
