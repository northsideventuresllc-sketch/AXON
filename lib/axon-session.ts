import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getCookiePath } from './paths';
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

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(
  payload: Omit<SessionPayload, 'issuedAt' | 'lastActivity'> & {
    issuedAt?: number;
    lastActivity?: number;
  }
): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error('AXON session secret is not configured');

  const now = Date.now();
  const fullPayload: SessionPayload = {
    operatorId: payload.operatorId,
    displayName: payload.displayName,
    deviceId: payload.deviceId,
    issuedAt: payload.issuedAt ?? now,
    lastActivity: payload.lastActivity ?? now,
    securityVerified: payload.securityVerified,
    totpVerified: payload.totpVerified,
  };

  const encoded = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = signPayload(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded).toString('utf8')) as SessionPayload;
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

export function isSessionExpired(
  payload: SessionPayload,
  now = Date.now(),
  inactivityMs = SESSION_INACTIVITY_MS
): boolean {
  return now - payload.lastActivity > inactivityMs;
}

export function verifySession(token: string): SessionPayload | null {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (isSessionExpired(payload)) return null;
  return payload;
}

export function refreshSession(token: string): string | null {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (isSessionExpired(payload)) return null;

  return createSessionToken({
    operatorId: payload.operatorId,
    displayName: payload.displayName,
    deviceId: payload.deviceId,
    issuedAt: payload.issuedAt,
    lastActivity: Date.now(),
    securityVerified: payload.securityVerified,
    totpVerified: payload.totpVerified,
  });
}

function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join('='));
  }
  return out;
}

export function parseSessionFromCookie(
  cookieHeaderOrValue: string | null | undefined
): SessionPayload | null {
  if (!cookieHeaderOrValue) return null;

  const trimmed = cookieHeaderOrValue.trim();
  if (trimmed.includes('=')) {
    const parsed = parseCookieHeader(trimmed);
    return verifySession(parsed[SESSION_COOKIE] ?? '');
  }

  return verifySession(trimmed);
}

export function createSessionPayload(
  operatorId: string,
  displayName: string,
  options?: {
    deviceId?: string;
    securityVerified?: boolean;
    totpVerified?: boolean;
  }
): SessionPayload {
  const now = Date.now();
  return {
    operatorId,
    displayName,
    deviceId: options?.deviceId || 'unknown',
    issuedAt: now,
    lastActivity: now,
    securityVerified: options?.securityVerified,
    totpVerified: options?.totpVerified,
  };
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: getCookiePath(),
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const refreshed = refreshSession(token);
  if (refreshed) {
    const cookieStoreWrite = await cookies();
    cookieStoreWrite.set(SESSION_COOKIE, refreshed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: getCookiePath(),
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return verifySession(refreshed || token);
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', clearSessionCookieOptions());
}

export const decodeSession = verifySessionToken;

export function isSessionActive(
  payload: SessionPayload,
  now = Date.now(),
  inactivityMs = SESSION_INACTIVITY_MS
): boolean {
  return !isSessionExpired(payload, now, inactivityMs);
}

export async function refreshSessionActivity(
  payload: SessionPayload
): Promise<SessionPayload> {
  const refreshed: SessionPayload = { ...payload, lastActivity: Date.now() };
  await setSessionCookie(refreshed);
  return refreshed;
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    path: getCookiePath(),
    maxAge: 0,
  };
}
