import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
  createAuditLog,
} from '@/lib/api-utils'

// POST /api/auth/clear-lockout — Clear rate limit lockout for a user
// Only accessible to authenticated admin/owner users
export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return unauthorizedResponse()

    // Only admins can clear lockouts
    if (!isFinancialUser(authUser.role)) {
      return errorResponse('Only administrators can clear account lockouts', 403)
    }

    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return errorResponse('Email is required', 400)
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Find and delete the rate limit entry
    const entry = await prisma.rateLimitEntry.findUnique({
      where: { identifier: normalizedEmail },
    })

    if (!entry) {
      return successResponse({ message: 'No lockout found for this email', email: normalizedEmail })
    }

    await prisma.rateLimitEntry.delete({
      where: { identifier: normalizedEmail },
    })

    // Audit log
    await createAuditLog({
      action: 'CLEAR_LOCKOUT',
      entity: 'User',
      entityId: normalizedEmail,
      userId: authUser.id,
      companyId: authUser.companyId,
      details: {
        clearedByEmail: authUser.email,
        clearedForEmail: normalizedEmail,
        previousAttemptCount: entry.count,
        wasLocked: !!entry.lockedUntil && new Date() < entry.lockedUntil,
      },
    })

    return successResponse({
      message: 'Lockout cleared successfully',
      email: normalizedEmail,
      previousAttemptCount: entry.count,
    })
  } catch (error) {
    console.error('Clear lockout error:', error)
    return errorResponse('Failed to clear lockout', 500)
  }
}
