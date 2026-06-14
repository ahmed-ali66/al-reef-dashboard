import {
  getAuthUser,
  createAuditLog,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isSystemAdmin,
} from '@/lib/api-utils'
import prisma from '@/lib/db'
import bcrypt from 'bcryptjs'

// POST /api/users/reset-password - Reset a user's password (admin only)
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isSystemAdmin(user.role)) {
      return forbiddenResponse('Only system admins can reset passwords')
    }

    const body = await request.json()
    const { userId, newPassword } = body

    if (!userId || !newPassword) {
      return errorResponse('User ID and new password are required')
    }

    // Enforce password policy for admin resets
    if (newPassword.length < 8) {
      return errorResponse('Password must be at least 8 characters long')
    }
    if (!/[A-Z]/.test(newPassword)) {
      return errorResponse('Password must contain at least one uppercase letter')
    }
    if (!/[0-9]/.test(newPassword)) {
      return errorResponse('Password must contain at least one number')
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, companyId: user.companyId },
    })

    if (!targetUser) {
      return errorResponse('User not found', 404)
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // FIX: Use a transaction to update password AND clear rate limit entries atomically.
    // This is the ROOT CAUSE of the "accountant can't login after admin password reset" bug:
    // The old code only updated the password but did NOT clear the RateLimitEntry for the user's email.
    // If the user had 5+ failed login attempts, they were locked out (lockedUntil in the future),
    // and even with a correct new password, isAccountLocked() still returned true, blocking login.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: 'User',
          entityId: userId,
          userId: user.id,
          companyId: user.companyId,
          details: JSON.stringify({ action: 'PASSWORD_RESET', targetEmail: targetUser.email, performedBy: user.email }),
        },
      }),
    ])

    // FIX: Clear any rate limit / lockout entries for this user's email.
    // Without this, a user who was locked out due to failed attempts remains locked
    // even after their password has been reset by an admin.
    try {
      const clearedEntries = await prisma.rateLimitEntry.deleteMany({
        where: { identifier: targetUser.email },
      })
      if (clearedEntries.count > 0) {
        console.log(`[AUTH] Cleared ${clearedEntries.count} rate limit entries for ${targetUser.email} after admin password reset`)
      }
    } catch (cleanupError) {
      // Non-critical — if cleanup fails, the lockout will still expire naturally
      console.error('[AUTH] Failed to clear rate limit entries after password reset (non-critical):', cleanupError)
    }

    return successResponse({ message: 'Password reset successfully' })
  } catch (error) {
    console.error('Error resetting password:', error)
    return errorResponse('Failed to reset password', 500)
  }
}
