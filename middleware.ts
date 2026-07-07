import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { getBasePath, stripBasePath } from '@/lib/paths';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/waitlist', '/api/telegram-webhook'];

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
    loginUrl.searchParams.set('next', `${basePath}${pathname}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
