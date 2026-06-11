import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Next.js 16 proxy.ts (formerly middleware.ts)
// Handles route protection, security headers, and auth validation

// Security headers applied to all responses
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }

  // Content-Security-Policy — stricter in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval for SSR
        "style-src 'self' 'unsafe-inline'", // Tailwind CSS requires unsafe-inline
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' blob.vercel-storage.com", // API calls only to same origin
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    )
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }

  return response
}

export default auth((req) => {
  const { pathname } = req.nextUrl

  // ─── Public Routes (No Authentication Required) ───────────────

  // Allow ALL NextAuth internal routes (required for login flow)
  // This includes csrf, providers, callback, session, signin, signout, and error routes
  if (pathname.startsWith('/api/auth/')) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow password reset request endpoint (unauthenticated access needed)
  if (pathname === '/api/reset-requests' && req.method === 'POST') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow general health endpoint (unauthenticated for monitoring)
  if (pathname === '/api/health') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow cron job endpoints (they have their own CRON_SECRET auth)
  if (pathname.startsWith('/api/cron/')) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow auto-backup endpoint (has its own CRON_SECRET auth for cron)
  if (pathname === '/api/backup/auto') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow production cutover endpoint (has its own CRON_SECRET auth)
  if (pathname === '/api/production-cutover') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/logo') ||
    pathname.includes('.')
  ) {
    return addSecurityHeaders(NextResponse.next())
  }

  // ─── Protected API Routes (Authentication Required) ───────────

  if (pathname.startsWith('/api/')) {
    if (!req.auth) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addSecurityHeaders(response)
    }
    return addSecurityHeaders(NextResponse.next())
  }

  // ─── Page Routes (Client-Side Auth Check) ─────────────────────

  // For the main page, allow access (client-side handles login redirect)
  return addSecurityHeaders(NextResponse.next())
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
