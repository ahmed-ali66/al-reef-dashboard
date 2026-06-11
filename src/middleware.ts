import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This middleware explicitly allows ALL requests through.
// It overrides the auto-generated Next.js 16 "Proxy (Middleware)"
// which was loading NextAuth and returning 401 for all unauthenticated requests,
// blocking the login flow entirely.
//
// Auth protection is handled at the route handler level via getAuthUser()
// in src/lib/api-utils.ts, not at the middleware level.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
