import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/db'

// Custom login endpoint that bypasses NextAuth v5's client-side flow entirely.
// This endpoint handles authentication server-side and creates a session via
// the standard NextAuth callback, avoiding the CSRF/providers endpoints
// that return 401 on certain Vercel deployments.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Look up user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { company: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'CredentialsSignin' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'AccountInactive' }, { status: 401 })
    }

    if (user.deletedAt) {
      return NextResponse.json({ error: 'AccountDeleted' }, { status: 401 })
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return NextResponse.json({ error: 'CredentialsSignin' }, { status: 401 })
    }

    // Return user data — the client will use this to create the session
    // via the NextAuth callback endpoint which DOES work on Vercel
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        nameAr: user.nameAr,
        nameBn: user.nameBn,
        nameUr: user.nameUr,
        mustChangePassword: user.mustChangePassword,
      },
    })
  } catch (error: any) {
    console.error('[LOGIN] Error:', error.message)
    return NextResponse.json({ error: 'ServerError' }, { status: 500 })
  }
}
