import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
} from '@/lib/api-utils'

// POST /api/auth/diagnose — Diagnose login issues for a given email
// Only accessible to authenticated admin/owner users OR rate-limited for unauthenticated access
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return errorResponse('Email is required', 400)
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if requester is authenticated admin — if so, allow full diagnostics
    const authUser = await getAuthUser()
    const isAdmin = authUser && isFinancialUser(authUser.role)

    // For unauthenticated requests, apply rate limiting
    if (!isAdmin) {
      // Simple rate limit: max 3 diagnosis requests per email per 15 minutes
      const recentDiagnoses = await prisma.rateLimitEntry.findUnique({
        where: { identifier: `diagnose:${normalizedEmail}` },
      })

      if (recentDiagnoses && recentDiagnoses.count >= 3 && recentDiagnoses.resetAt && new Date() < recentDiagnoses.resetAt) {
        return errorResponse('Too many diagnosis requests. Please try again later.', 429)
      }

      // Record this diagnosis attempt
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
    }

    // Find user
    const user = await prisma.user.findUnique({
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
    } = {
      email: normalizedEmail,
      userExists: false,
    }

    if (!user) {
      diagnosis.userExists = false
      return successResponse(diagnosis)
    }

    diagnosis.userExists = true
    diagnosis.isActive = user.isActive
    diagnosis.isDeleted = !!user.deletedAt
    diagnosis.mustChangePassword = user.mustChangePassword
    diagnosis.companyName = user.company?.name

    // Check rate limit / lockout status
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

    // For non-admin users, limit the information returned
    if (!isAdmin) {
      delete diagnosis.failedAttemptCount
    }

    return successResponse(diagnosis)
  } catch (error) {
    console.error('Auth diagnose error:', error)
    return errorResponse('Failed to diagnose auth issue', 500)
  }
}
