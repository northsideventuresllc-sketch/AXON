/** Next.js basePath from env (standalone Vercel deploy at /axon). */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

/** Cookie path — must match basePath when app is mounted under a subpath. */
export function getCookiePath(): string {
  return getBasePath() || '/';
}

/**
 * Prefix an in-app route for custom base paths (NI portal vanity URLs).
 * When basePath is omitted, returns the path as-is — Next.js Link adds NEXT_PUBLIC_BASE_PATH.
 */
export function appPath(path: string, basePath = ''): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!basePath) return normalized;
  if (normalized === '/') return `${basePath}/dashboard`;
  return `${basePath}${normalized}`;
}

/** Strip Next.js basePath prefix from middleware pathname when present. */
export function stripBasePath(pathname: string): string {
  const base = getBasePath();
  if (!base || !pathname.startsWith(base)) return pathname;
  const stripped = pathname.slice(base.length);
  return stripped || '/';
}
