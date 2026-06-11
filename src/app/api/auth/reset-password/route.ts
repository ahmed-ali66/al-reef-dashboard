import prisma from '@/lib/db'
import { errorResponse, successResponse } from '@/lib/api-utils'
import bcrypt from 'bcryptjs'

// POST /api/auth/reset-password — Reset password using a valid token
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = (body.token || '').trim()
    const newPassword = (body.newPassword || '').trim()

    if (!token) {
      return errorResponse('Token is required')
    }

    // FIX: Enforce same password policy as admin reset (8 chars, 1 uppercase, 1 number)
    if (!newPassword || newPassword.length < 8) {
      return errorResponse('New password must be at least 8 characters')
    }
    if (!/[A-Z]/.test(newPassword)) {
      return errorResponse('Password must contain at least one uppercase letter')
    }
    if (!/[0-9]/.test(newPassword)) {
      return errorResponse('Password must contain at least one number')
    }

    // FIX: Use atomic token consumption to prevent TOCTOU race condition
    // Update the token with a usedAt timestamp only if it's currently null (not used)
    const consumedToken = await prisma.passwordResetToken.updateMany({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    })

    if (consumedToken.count === 0) {
      // Token was either already used, expired, or doesn't exist
      return errorResponse('Invalid or expired reset token')
    }

    // Get the token details for the email
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!resetToken) {
      return errorResponse('Invalid reset token')
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: resetToken.email },
    })

    if (!user) {
      return errorResponse('User not found')
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update the user's password in a transaction with audit log
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_COMPLETED',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          companyId: user.companyId,
          details: JSON.stringify({ email: user.email, method: 'self_service_reset' }),
        },
      }),
    ])

    // Clear any rate limits for this user
    await prisma.rateLimitEntry.deleteMany({
      where: { identifier: user.email },
    }).catch(() => {})

    return successResponse({
      message: 'Password has been reset successfully. You can now log in with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return errorResponse('Failed to reset password', 500)
  }
}
