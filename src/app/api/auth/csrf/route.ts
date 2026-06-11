import { NextRequest } from 'next/server'

// FIX: Custom CSRF endpoint that reads the token from the cookie set by NextAuth
// The default NextAuth v5 /api/auth/csrf endpoint returns 401 on some Vercel deployments
// This custom handler reads the CSRF token from the cookie and returns it in the response body
export async function GET(request: NextRequest) {
  try {
    // The CSRF cookie is set by NextAuth as __Host-authjs.csrf-token
    // The cookie value format is: tokenValue|tokenHash
    const csrfCookie = request.cookies.get('__Host-authjs.csrf-token')
    
    if (csrfCookie) {
      // Extract just the token value (before the |)
      const tokenValue = decodeURIComponent(csrfCookie.value).split('|')[0]
      return Response.json({ csrfToken: tokenValue })
    }
    
    // Fallback: try the non-prefixed cookie name (development)
    const csrfCookieAlt = request.cookies.get('authjs.csrf-token') || 
                          request.cookies.get('next-auth.csrf-token')
    if (csrfCookieAlt) {
      const tokenValue = decodeURIComponent(csrfCookieAlt.value).split('|')[0]
      return Response.json({ csrfToken: tokenValue })
    }
    
    // No CSRF cookie found — the NextAuth init hasn't set one yet
    // This means the user needs to make a request to any NextAuth endpoint first
    return Response.json({ csrfToken: '' }, { status: 200 })
  } catch (error) {
    console.error('[AUTH-CSRF] Error reading CSRF token:', error)
    return Response.json({ csrfToken: '' }, { status: 200 })
  }
}
