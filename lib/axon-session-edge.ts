/**
 * Edge-compatible session verification for Next.js middleware (Web Crypto).
 */
import type { SessionPayload } from './axon-security-types';

export const SESSION_COOKIE = 'axon_session';
export const SESSION_INACTIVITY_MS = 5 * 60 * 1000;

function getSessionSecret(): string {
  return (
    process.env.AXON_SESSION_SECRET ||
    process.env.AXON_DASHBOARD_SECRET ||
    process.env.SUPABASE_SERVICE_KEY?.slice(0, 32) ||
    ''
  );
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifySignature(encoded: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = base64UrlToBytes(signature);
  return crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as unknown as BufferSource,
    new TextEncoder().encode(encoded)
  );
}

export async function decodeSessionEdge(token: string): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const valid = await verifySignature(encoded, signature, secret);
  if (!valid) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(encoded));
    const payload = JSON.parse(json) as SessionPayload;
    if (
      !payload.operatorId ||
      !payload.displayName ||
      !payload.deviceId ||
      typeof payload.issuedAt !== 'number' ||
      typeof payload.lastActivity !== 'number'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isSessionActiveEdge(
  payload: SessionPayload,
  now = Date.now(),
  inactivityMs = SESSION_INACTIVITY_MS
): boolean {
  return now - payload.lastActivity <= inactivityMs;
}
