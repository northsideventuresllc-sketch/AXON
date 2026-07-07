import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/axon-session-edge';
import { decodeSessionEdge, isSessionActiveEdge } from '@/lib/axon-session-edge';
import { getBasePath, getCookiePath, stripBasePath } from '@/lib/paths';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/passcode',
  '/api/auth/security-questions',
  '/api/auth/recovery',
  '/api/auth/passkey',
  '/api/waitlist',
  '/api/telegram-webhook',
];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.endsWith('/api/telegram-webhook') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  );
}

export async function middleware(request: NextRequest) {
  const basePath = getBasePath();
  const { pathname: rawPathname } = request.nextUrl;
  const pathname = stripBasePath(rawPathname);

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSessionEdge(token) : null;

  if (!session || !isSessionActiveEdge(session)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: session ? 'Session expired due to inactivity' : 'Unauthorized' },
        { status: 401 }
      );
    }
    const loginUrl = new URL(`${basePath}/login`, request.url);
    loginUrl.searchParams.set('next', `${basePath}${pathname}`);
    if (session && !isSessionActiveEdge(session)) {
      loginUrl.searchParams.set('reason', 'inactivity');
    }
    const res = NextResponse.redirect(loginUrl);
    if (token) {
      res.cookies.set(SESSION_COOKIE, '', { path: getCookiePath(), maxAge: 0 });
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
