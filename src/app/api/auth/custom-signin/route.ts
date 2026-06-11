import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/auth'

// FIX: Custom sign-in endpoint that bypasses the NextAuth v5 signIn() client function
// which depends on /api/auth/csrf and /api/auth/providers endpoints that return 401 on Vercel.
// This endpoint handles authentication server-side and sets the session cookie directly.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Use the server-side signIn function from NextAuth
    // This bypasses the CSRF check that the client-side flow requires
    const result = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    })

    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[CUSTOM-SIGNIN] Error:', error.message)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
}
