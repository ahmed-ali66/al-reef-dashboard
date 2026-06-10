import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/db'

// PHASE 3: Database-backed rate limiting (replaces in-memory Map)
// Survives server restarts and works across multiple instances
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 15

async function isAccountLocked(email: string): Promise<{ locked: boolean; lockedUntil?: Date; remainingMinutes?: number }> {
  try {
    const entry = await prisma.rateLimitEntry.findUnique({ where: { identifier: email } })
    if (!entry) return { locked: false }

    // Check if locked
    if (entry.lockedUntil && new Date() < entry.lockedUntil) {
      const remainingMs = entry.lockedUntil.getTime() - Date.now()
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
      return { locked: true, lockedUntil: entry.lockedUntil, remainingMinutes }
    }

    // Clear expired lockout
    if (entry.lockedUntil && new Date() >= entry.lockedUntil) {
      await prisma.rateLimitEntry.delete({ where: { identifier: email } }).catch(() => {})
    }
    return { locked: false }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // If DB check fails, allow login attempt (fail open rather than lock out everyone)
    return { locked: false }
  }
}

async function recordFailedAttempt(email: string): Promise<void> {
  try {
    const existing = await prisma.rateLimitEntry.findUnique({ where: { identifier: email } })

    if (existing) {
      const newCount = existing.count + 1
      const lockedUntil = newCount >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
        : existing.lockedUntil

      await prisma.rateLimitEntry.update({
        where: { identifier: email },
        data: {
          count: newCount,
          lockedUntil,
          resetAt: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000),
        },
      })
    } else {
      await prisma.rateLimitEntry.create({
        data: {
          identifier: email,
          count: 1,
          resetAt: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000),
        },
      })
    }
  } catch (error) {
    console.error('Rate limit record error:', error)
    // Don't throw — rate limiting shouldn't block login entirely on DB failure
  }
}

async function clearFailedAttempts(email: string): Promise<void> {
  try {
    await prisma.rateLimitEntry.delete({ where: { identifier: email } }).catch(() => {})
  } catch (error) {
    // Silent — cleanup failure shouldn't affect login
  }
}

// PHASE 3: Periodic cleanup of expired rate limit entries (runs on first login check)
let lastCleanup = 0
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

async function cleanupExpiredEntries(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  try {
    await prisma.rateLimitEntry.deleteMany({
      where: {
        OR: [
          { lockedUntil: { not: null, lt: new Date() } },
          { resetAt: { not: null, lt: new Date() } },
        ],
      },
    })
  } catch {
    // Silent cleanup
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.warn('[AUTH] Login attempt missing credentials')
          return null
        }

        const email = (credentials.email as string).trim().toLowerCase()

        // PHASE 3: Run periodic cleanup of expired entries
        await cleanupExpiredEntries()

        // Check brute-force lockout (DB-backed)
        const lockStatus = await isAccountLocked(email)
        if (lockStatus.locked) {
          console.warn(`[AUTH] Account locked for ${email}. Locked until: ${lockStatus.lockedUntil?.toISOString()}. Remaining: ${lockStatus.remainingMinutes} minutes`)
          // Return a special object to indicate lockout — we'll handle this in callbacks
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { company: true },
        })

        if (!user) {
          console.warn(`[AUTH] Login failed — user not found: ${email}`)
          await recordFailedAttempt(email)
          return null
        }

        if (!user.isActive) {
          console.warn(`[AUTH] Login failed — user inactive: ${email}`)
          await recordFailedAttempt(email)
          return null
        }

        // Check if user is soft-deleted
        if (user.deletedAt) {
          console.warn(`[AUTH] Login failed — user soft-deleted: ${email}`)
          await recordFailedAttempt(email)
          return null
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isValidPassword) {
          console.warn(`[AUTH] Login failed — wrong password for: ${email}`)
          await recordFailedAttempt(email)
          return null
        }

        // Clear failed attempts on successful login
        await clearFailedAttempts(email)

        console.log(`[AUTH] Login successful for: ${email} (role: ${user.role})`)

        // Log the login
        try {
          await prisma.auditLog.create({
            data: {
              action: 'LOGIN',
              entity: 'User',
              entityId: user.id,
              userId: user.id,
              companyId: user.companyId,
              details: JSON.stringify({ email: user.email, role: user.role }),
            },
          })
        } catch {
          // Audit logging should not break login
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          nameAr: user.nameAr,
          nameBn: user.nameBn,
          nameUr: user.nameUr,
          mustChangePassword: user.mustChangePassword,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.companyId = (user as any).companyId
        token.nameAr = (user as any).nameAr
        token.nameBn = (user as any).nameBn
        token.nameUr = (user as any).nameUr
        token.mustChangePassword = (user as any).mustChangePassword
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).companyId = token.companyId as string
        ;(session.user as any).nameAr = token.nameAr as string | null
        ;(session.user as any).nameBn = token.nameBn as string | null
        ;(session.user as any).nameUr = token.nameUr as string | null
        ;(session.user as any).mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours (reduced from 24 for security)
  },
  secret: process.env.NEXTAUTH_SECRET,
})
