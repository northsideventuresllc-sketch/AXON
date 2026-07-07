/** Vanity URL base for an operator's AXON workspace inside the NI portal. */
export function axonPublicPath(username: string, subpath = ''): string {
  const normalized = username.trim().toLowerCase();
  const base = `/axon-${normalized}`;
  if (!subpath) return base;
  const path = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${base}${path}`;
}
