import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function GET() {
  try {
    const h = await headers()
    const host = h.get('host')
    const xForwardedHost = h.get('x-forwarded-host')
    const xForwardedProto = h.get('x-forwarded-proto')
    const xForwardedFor = h.get('x-forwarded-for')
    
    // Try to get session
    const session = await auth()
    
    // Check env vars
    const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET
    const hasAuthSecret = !!process.env.AUTH_SECRET
    const hasNextAuthUrl = !!process.env.NEXTAUTH_URL
    const nodeEnv = process.env.NODE_ENV
    
    return Response.json({
      host,
      xForwardedHost,
      xForwardedProto,
      xForwardedFor,
      session: session ? { email: (session.user as any)?.email, role: (session.user as any)?.role } : null,
      env: {
        hasNextAuthSecret,
        hasAuthSecret,
        hasNextAuthUrl,
        nodeEnv,
        nextAuthSecretLength: process.env.NEXTAUTH_SECRET?.length ?? 0,
        authSecretLength: process.env.AUTH_SECRET?.length ?? 0,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 })
  }
}
