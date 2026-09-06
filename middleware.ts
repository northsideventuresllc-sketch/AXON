import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { getBasePath, stripBasePath } from '@/lib/paths';
import { tryGetDashboardSecret } from '@/lib/axon-secrets.mjs';
import { evaluateDashboardAuth } from '@/lib/axon-dashboard-gate.mjs';

// Logged once per server instance — a missing AXON_DASHBOARD_SECRET is a deploy
// misconfiguration, not a per-request event worth spamming the log for.
let loggedMissingDashboardSecret = false;

const PUBLIC_PATHS = [
  '/login',
  '/guest',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/waitlist',
  '/api/telegram-webhook',
  '/api/axon/guest-chat',
  // Inbound server-to-server webhooks — auth'd by their own shared-secret header
  // (MATCH_FIT_WEBHOOK_SECRET), not the AXON dashboard session cookie.
  '/api/axon/match-fit/posting-confirmation',
  '/api/axon/match-fit/outreach-event',
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

  const secret = tryGetDashboardSecret();
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const decision = evaluateDashboardAuth({ secret, sessionCookie: session });

  if (decision.outcome === 'secret_not_configured') {
    // Never derive a login secret from the Supabase service key (AX-DASHBOARD-SECRET-OWN-0906)
    // — refuse outright rather than boot with a fallback nobody explicitly set.
    if (!loggedMissingDashboardSecret) {
      loggedMissingDashboardSecret = true;
      console.error(
        '[axon-middleware] AXON_DASHBOARD_SECRET is not configured — refusing all dashboard access until it is set.',
      );
    }
    return new NextResponse('Dashboard secret is not configured', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }

  if (decision.outcome === 'unauthenticated') {
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
