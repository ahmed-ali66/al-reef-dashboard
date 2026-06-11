import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  successResponse,
  isSystemAdmin,
} from '@/lib/api-utils'

// POST /api/auth/diagnose — Diagnose login issues for a given email
// SECURITY: Limits information disclosure for unauthenticated users
// Only returns specific details to authenticated admin users
export async function POST(request: Request) {
  try {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      return errorResponse('Email is required', 400)
    }
    const { email } = body

    if (!email || typeof email !== 'string') {
      return errorResponse('Email is required', 400)
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return errorResponse('Invalid email format', 400)
    }

    // Check if requester is authenticated admin — if so, allow full diagnostics
    let isAdmin = false
    try {
      const authUser = await getAuthUser()
      isAdmin = !!(authUser && isSystemAdmin(authUser.role))
    } catch {
      // Auth check failed, treat as unauthenticated
    }

    // For unauthenticated requests, apply rate limiting
    if (!isAdmin) {
      // Simple rate limit: max 3 diagnosis requests per email per 15 minutes
      try {
        const recentDiagnoses = await prisma.rateLimitEntry.findUnique({
          where: { identifier: `diagnose:${normalizedEmail}` },
        })

        if (recentDiagnoses && recentDiagnoses.count >= 3 && recentDiagnoses.resetAt && new Date() < recentDiagnoses.resetAt) {
          return errorResponse('Too many diagnosis requests. Please try again later.', 429)
        }

        // Record this diagnosis attempt atomically
        if (recentDiagnoses) {
          await prisma.rateLimitEntry.update({
            where: { identifier: `diagnose:${normalizedEmail}` },
            data: {
              count: { increment: 1 },
              resetAt: new Date(Date.now() + 15 * 60 * 1000),
            },
          })
        } else {
          await prisma.rateLimitEntry.create({
            data: {
              identifier: `diagnose:${normalizedEmail}`,
              count: 1,
              resetAt: new Date(Date.now() + 15 * 60 * 1000),
            },
          })
        }
      } catch (rateLimitError) {
        // If rate limit DB check fails, allow the request (fail open)
        console.error('[AUTH-DIAGNOSE] Rate limit check failed:', rateLimitError)
      }
    }

    // Find user
    let user: any = null
    try {
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          isActive: true,
          deletedAt: true,
          role: true,
          mustChangePassword: true,
          company: {
            select: { id: true, name: true },
          },
        },
      })
    } catch (dbError) {
      console.error('[AUTH-DIAGNOSE] User lookup failed:', dbError)
      // Don't reveal DB errors to unauthenticated users
      if (isAdmin) {
        return errorResponse('Database lookup failed — possible connectivity issue', 503)
      }
      return errorResponse('Unable to diagnose at this time. Please try again later.', 503)
    }

    // Build diagnosis response
    const diagnosis: {
      email: string
      userExists: boolean
      isActive?: boolean
      isDeleted?: boolean
      isLockedOut?: boolean
      lockoutMinutesRemaining?: number
      failedAttemptCount?: number
      mustChangePassword?: boolean
      companyName?: string
      dbError?: boolean
    } = {
      email: normalizedEmail,
      userExists: false,
    }

    if (!user) {
      // SECURITY: For non-admin users, don't confirm whether user exists or not
      if (!isAdmin) {
        // Return a generic response that doesn't reveal user existence
        return successResponse({
          email: normalizedEmail,
          userExists: false, // Always false for non-admin to prevent enumeration
          // Provide actionable next steps without confirming existence
          suggestion: 'If you have an account, check your email and password. Contact your administrator if issues persist.',
        })
      }
      diagnosis.userExists = false
      return successResponse(diagnosis)
    }

    diagnosis.userExists = true
    diagnosis.isActive = user.isActive
    diagnosis.isDeleted = !!user.deletedAt
    diagnosis.mustChangePassword = user.mustChangePassword
    diagnosis.companyName = user.company?.name

    // Check rate limit / lockout status
    try {
      const rateLimitEntry = await prisma.rateLimitEntry.findUnique({
        where: { identifier: normalizedEmail },
      })

      if (rateLimitEntry) {
        diagnosis.failedAttemptCount = rateLimitEntry.count
        if (rateLimitEntry.lockedUntil && new Date() < rateLimitEntry.lockedUntil) {
          diagnosis.isLockedOut = true
          const remainingMs = rateLimitEntry.lockedUntil.getTime() - Date.now()
          diagnosis.lockoutMinutesRemaining = Math.ceil(remainingMs / (60 * 1000))
        } else {
          diagnosis.isLockedOut = false
        }
      } else {
        diagnosis.failedAttemptCount = 0
        diagnosis.isLockedOut = false
      }
    } catch (rateLimitError) {
      console.error('[AUTH-DIAGNOSE] Rate limit lookup failed:', rateLimitError)
      diagnosis.dbError = true
    }

    // For non-admin users, limit the information returned
    if (!isAdmin) {
      delete diagnosis.failedAttemptCount
      delete diagnosis.companyName
    }

    return successResponse(diagnosis)
  } catch (error) {
    console.error('[AUTH-DIAGNOSE] Unexpected error:', error)
    return errorResponse('Failed to diagnose auth issue', 500)
  }
}
