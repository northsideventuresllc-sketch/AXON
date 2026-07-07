/** Prefix sub-routes under a portal vanity base path (/axon-{username}). */
export function appPath(path: string, basePath: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') return `${basePath}/dashboard`;
  return `${basePath}${normalized}`;
}
