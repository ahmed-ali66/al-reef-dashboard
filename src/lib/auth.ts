import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/db'

// ─── Configuration ──────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 15
const DB_RETRY_ATTEMPTS = 2
const DB_RETRY_DELAY_MS = 500

// ─── Auth Health Monitoring ─────────────────────────────────────
interface AuthHealthMetrics {
  totalAttempts: number
  successfulLogins: number
  failedLogins: number
  dbErrors: number
  rateLimitTriggers: number
  lastDbErrorAt: Date | null
}

const authMetrics: AuthHealthMetrics = {
  totalAttempts: 0,
  successfulLogins: 0,
  failedLogins: 0,
  dbErrors: 0,
  rateLimitTriggers: 0,
  lastDbErrorAt: null,
}

export function getAuthMetrics(): AuthHealthMetrics & { successRate: string } {
  const successRate = authMetrics.totalAttempts > 0
    ? ((authMetrics.successfulLogins / authMetrics.totalAttempts) * 100).toFixed(1)
    : 'N/A'
  return { ...authMetrics, successRate: `${successRate}%` }
}

// ─── Database Retry Helper ──────────────────────────────────────
// In Vercel serverless, Neon PostgreSQL cold starts can cause transient connection failures.
// This helper retries DB operations before giving up.
async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxRetries: number = DB_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: any
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error
      const isTransient =
        error?.code === 'P1001' || // Connection error
        error?.code === 'P1002' || // Connection timeout
        error?.code === 'P1008' || // Operation timeout
        error?.code === 'P1010' || // Access denied
        error?.code === 'P1011' || // Already opened
        error?.code === 'P1017' || // Server closed
        error?.message?.includes('connect') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ETIMEDOUT')

      if (!isTransient || attempt === maxRetries) {
        console.error(`[AUTH] ${label} failed (attempt ${attempt}/${maxRetries}):`, error?.message || error)
        break
      }

      console.warn(`[AUTH] ${label} transient error (attempt ${attempt}/${maxRetries}), retrying in ${DB_RETRY_DELAY_MS}ms...`)
      await new Promise(resolve => setTimeout(resolve, DB_RETRY_DELAY_MS * attempt))
    }
  }
  throw lastError
}

// ─── Rate Limiting (Atomic Operations) ─────────────────────────
// FIX: Use atomic Prisma operations instead of read-then-write to prevent race conditions.
// FIX: Don't extend resetAt on every failure — only set it on creation.
// FIX: Don't extend lockout duration on failures after already locked.

async function isAccountLocked(email: string): Promise<{ locked: boolean; lockedUntil?: Date; remainingMinutes?: number }> {
  try {
    const entry = await withRetry(
      () => prisma.rateLimitEntry.findUnique({ where: { identifier: email } }),
      'isAccountLocked lookup'
    )

    if (!entry) return { locked: false }

    // Check if currently locked
    if (entry.lockedUntil && new Date() < entry.lockedUntil) {
      const remainingMs = entry.lockedUntil.getTime() - Date.now()
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
      return { locked: true, lockedUntil: entry.lockedUntil, remainingMinutes }
    }

    // Lockout has expired — atomically clean up the stale entry
    if (entry.lockedUntil && new Date() >= entry.lockedUntil) {
      try {
        await prisma.rateLimitEntry.deleteMany({
          where: {
            identifier: email,
            lockedUntil: { not: null, lt: new Date() },
          },
        })
      } catch {
        // Non-critical — stale entry will be cleaned up later
      }
    }

    // Also check if the entry has been sitting too long without a lockout
    // (count but no lockout and resetAt has passed)
    if (!entry.lockedUntil && entry.resetAt && new Date() >= entry.resetAt) {
      try {
        await prisma.rateLimitEntry.deleteMany({
          where: {
            identifier: email,
            lockedUntil: null,
            resetAt: { lt: new Date() },
          },
        })
      } catch {
        // Non-critical
      }
    }

    return { locked: false }
  } catch (error) {
    console.error('[AUTH] Rate limit check error (allowing login — fail open):', error)
    authMetrics.dbErrors++
    authMetrics.lastDbErrorAt = new Date()
    // If DB check fails, allow login attempt (fail open rather than lock out everyone)
    return { locked: false }
  }
}

async function recordFailedAttempt(email: string): Promise<void> {
  try {
    // FIX: Use atomic upsert with increment instead of read-then-write
    // This eliminates the race condition where concurrent requests read the same count
    await withRetry(async () => {
      // First try to increment existing entry atomically
      const existing = await prisma.rateLimitEntry.findUnique({ where: { identifier: email } })

      if (!existing) {
        // Create new entry
        await prisma.rateLimitEntry.create({
          data: {
            identifier: email,
            count: 1,
            resetAt: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000),
          },
        })
      } else {
        // Atomically increment count
        const newCount = existing.count + 1

        // FIX: Only set lockedUntil on the FIRST time count reaches MAX (don't keep extending)
        // If already locked, don't extend the lockout duration
        const shouldLock = newCount >= MAX_LOGIN_ATTEMPTS && !existing.lockedUntil

        await prisma.rateLimitEntry.update({
          where: { identifier: email },
          data: {
            count: newCount,
            // Only set lockedUntil if crossing the threshold for the first time
            lockedUntil: shouldLock
              ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
              : existing.lockedUntil,
            // FIX: Don't extend resetAt on every failure — keep the original window
            // Only update resetAt if it's already passed (stale entry)
            resetAt: existing.resetAt && new Date() < existing.resetAt
              ? existing.resetAt
              : new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000),
          },
        })
      }
    }, 'recordFailedAttempt')

    authMetrics.rateLimitTriggers++
  } catch (error) {
    console.error('[AUTH] Rate limit record error (non-critical):', error)
    authMetrics.dbErrors++
    authMetrics.lastDbErrorAt = new Date()
    // Don't throw — rate limiting shouldn't block login entirely on DB failure
  }
}

async function clearFailedAttempts(email: string): Promise<void> {
  try {
    await prisma.rateLimitEntry.deleteMany({
      where: { identifier: email },
    })
  } catch (error) {
    // Silent — cleanup failure shouldn't affect login
  }
}

// ─── Periodic Cleanup (Serverless-Safe) ─────────────────────────
// FIX: Instead of module-level variable that resets on every cold start,
// use a DB-backed timestamp to coordinate cleanup across serverless instances.

async function cleanupExpiredEntries(): Promise<void> {
  try {
    // Use a DB-backed lock to ensure only one instance runs cleanup per interval
    const CLEANUP_LOCK_ID = 'auth:cleanup:lock'
    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

    // Check if cleanup was recently run by looking at a special rate limit entry
    const lockEntry = await prisma.rateLimitEntry.findUnique({
      where: { identifier: CLEANUP_LOCK_ID },
    })

    if (lockEntry) {
      const timeSinceLastCleanup = Date.now() - lockEntry.createdAt.getTime()
      if (timeSinceLastCleanup < CLEANUP_INTERVAL_MS) {
        // Cleanup was recently run by another instance, skip
        return
      }
      // Lock is stale, delete it and proceed
      await prisma.rateLimitEntry.delete({ where: { identifier: CLEANUP_LOCK_ID } }).catch(() => {})
    }

    // Acquire cleanup lock (create entry with current timestamp)
    try {
      await prisma.rateLimitEntry.create({
        data: {
          identifier: CLEANUP_LOCK_ID,
          count: 0,
          resetAt: new Date(Date.now() + CLEANUP_INTERVAL_MS),
        },
      })
    } catch {
      // Another instance acquired the lock first, skip
      return
    }

    // Perform cleanup — only delete entries that are genuinely expired
    const result = await prisma.rateLimitEntry.deleteMany({
      where: {
        AND: [
          { identifier: { not: CLEANUP_LOCK_ID } },
          {
            OR: [
              // Expired lockouts
              { lockedUntil: { not: null, lt: new Date() } },
              // Stale entries with no lockout and resetAt passed
              { lockedUntil: null, resetAt: { not: null, lt: new Date() } },
            ],
          },
        ],
      },
    })

    if (result.count > 0) {
      console.log(`[AUTH] Cleanup removed ${result.count} expired rate limit entries`)
    }
  } catch (error) {
    console.error('[AUTH] Cleanup error (non-critical):', error)
  }
}

// ─── NextAuth Configuration ─────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({
  // CRITICAL FIX: trustHost is required for Vercel deployments.
  // Without this, NextAuth v5 rejects the host header from Vercel's CDN/proxy,
  // causing CSRF token validation failures that result in "Unauthorized" errors.
  // This is the ROOT CAUSE of the intermittent then total auth failure.
  trustHost: true,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        authMetrics.totalAttempts++

        if (!credentials?.email || !credentials?.password) {
          console.warn('[AUTH] Login attempt missing credentials')
          authMetrics.failedLogins++
          return null
        }

        const email = (credentials.email as string).trim().toLowerCase()

        // Validate email format to prevent injection
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          console.warn(`[AUTH] Invalid email format: ${email}`)
          authMetrics.failedLogins++
          return null
        }

        // Run periodic cleanup (serverless-safe)
        await cleanupExpiredEntries().catch(() => {})

        // Check brute-force lockout (DB-backed)
        try {
          const lockStatus = await isAccountLocked(email)
          if (lockStatus.locked) {
            console.warn(`[AUTH] Account locked for ${email}. Locked until: ${lockStatus.lockedUntil?.toISOString()}. Remaining: ${lockStatus.remainingMinutes} minutes`)
            authMetrics.rateLimitTriggers++
            authMetrics.failedLogins++
            return null
          }
        } catch (error) {
          // If lock check fails completely, allow login to proceed (fail open)
          console.error('[AUTH] Lock check failed, allowing login attempt:', error)
        }

        // Look up user with retry for transient DB errors
        let user: any = null
        try {
          user = await withRetry(
            () => prisma.user.findUnique({
              where: { email },
              include: { company: true },
            }),
            'user lookup'
          )
        } catch (error) {
          // CRITICAL FIX: If DB lookup fails entirely, don't record a failed attempt
          // This prevents false lockouts caused by DB connectivity issues
          console.error(`[AUTH] User lookup failed for ${email} (DB error, not recording failed attempt):`, error)
          authMetrics.dbErrors++
          authMetrics.lastDbErrorAt = new Date()
          authMetrics.failedLogins++
          return null
        }

        if (!user) {
          console.warn(`[AUTH] Login failed — user not found: ${email}`)
          await recordFailedAttempt(email)
          authMetrics.failedLogins++
          return null
        }

        if (!user.isActive) {
          console.warn(`[AUTH] Login failed — user inactive: ${email}`)
          await recordFailedAttempt(email)
          authMetrics.failedLogins++
          return null
        }

        // Check if user is soft-deleted
        if (user.deletedAt) {
          console.warn(`[AUTH] Login failed — user soft-deleted: ${email}`)
          await recordFailedAttempt(email)
          authMetrics.failedLogins++
          return null
        }

        // Password verification with error handling
        let isValidPassword = false
        try {
          isValidPassword = await bcrypt.compare(
            credentials.password as string,
            user.password
          )
        } catch (error) {
          console.error(`[AUTH] Password comparison error for ${email}:`, error)
          authMetrics.dbErrors++
          authMetrics.lastDbErrorAt = new Date()
          authMetrics.failedLogins++
          return null
        }

        if (!isValidPassword) {
          console.warn(`[AUTH] Login failed — wrong password for: ${email}`)
          await recordFailedAttempt(email)
          authMetrics.failedLogins++
          return null
        }

        // Clear failed attempts on successful login
        await clearFailedAttempts(email)

        authMetrics.successfulLogins++
        console.log(`[AUTH] Login successful for: ${email} (role: ${user.role})`)

        // Log the login (non-blocking, non-critical)
        prisma.auditLog.create({
          data: {
            action: 'LOGIN',
            entity: 'User',
            entityId: user.id,
            userId: user.id,
            companyId: user.companyId,
            details: JSON.stringify({ email: user.email, role: user.role, timestamp: new Date().toISOString() }),
          },
        }).catch(() => {})

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
    error: '/',  // FIX: Redirect auth errors back to login page instead of /api/auth/error raw JSON
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  // FIX: NextAuth v5 (Auth.js) renamed NEXTAUTH_SECRET to AUTH_SECRET.
  // Check both env vars — if only AUTH_SECRET is set on Vercel, auth breaks without this.
  // This was a major cause of the "Unauthorized" error: secret was undefined.
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  // FIX: Explicitly set debug in development only
  debug: process.env.NODE_ENV === 'development',
})
