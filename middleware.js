import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow these
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    // Machine-to-machine ingestion (the Natro-OS-Data-Fetch scheduler).
    // Not cookie-authenticated: the route itself requires a Bearer token
    // checked against INGEST_TOKEN, and rejects everything without it.
    pathname.startsWith('/api/ingest') ||
    pathname.startsWith('/_next') ||
    // Install/branding assets: iOS fetches these without cookies, and a
    // redirected apple-touch-icon breaks Add to Home Screen.
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/icon-192.png' ||
    pathname === '/icon-512.png'
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('kb-auth');
  const password = process.env.KB_PASSWORD || '';

  // If no password set, open access (dev mode)
  if (!password) return NextResponse.next();

  if (!cookie || cookie.value !== password) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
