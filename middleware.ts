import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { getBasePath, stripBasePath } from '@/lib/paths';

const PUBLIC_PATHS = [
  '/login',
  '/guest',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/waitlist',
  '/api/telegram-webhook',
  '/api/axon/guest-chat',
  // Inbound server-to-server webhook — auth'd by its own shared-secret header
  // (MATCH_FIT_WEBHOOK_SECRET), not the AXON dashboard session cookie.
  '/api/axon/match-fit/posting-confirmation',
];

export function middleware(request: NextRequest) {
  const basePath = getBasePath();
  const { pathname: rawPathname } = request.nextUrl;
  const pathname = stripBasePath(rawPathname);

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.endsWith('/api/telegram-webhook') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const secret =
    process.env.AXON_DASHBOARD_SECRET || process.env.SUPABASE_SERVICE_KEY?.slice(0, 32);
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!secret || session !== secret) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL(`${basePath}/login`, request.url);
    // Store the app-internal path WITHOUT basePath: the client router.push on the
    // login page re-adds basePath, so including it here double-prefixes (/axon/axon/…).
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
