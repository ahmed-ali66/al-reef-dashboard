import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isSystemAdmin,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'

// PUT /api/users/[id] - Update a user (admin only + OCC)
// PHASE 2: OCC for concurrency safety
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isSystemAdmin(user.role)) {
      return forbiddenResponse('Only system admins can update users')
    }

    const { id } = await params

    const existing = await prisma.user.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })

    if (!existing) {
      return errorResponse('User not found', 404)
    }

    const body = await request.json()
    // FIX: Normalize email to lowercase if being changed, to match the login flow
    const email = body.email ? (body.email as string).trim().toLowerCase() : body.email
    const { name, nameAr, nameBn, nameUr, role, isActive } = body

    // Validate role if being changed
    if (role !== undefined) {
      const validRoles = ['owner', 'admin', 'staff', 'accountant']
      if (!validRoles.includes(role)) {
        return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
      }
    }

    // If email is being changed, check for uniqueness
    if (email && email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      })
      if (emailTaken) {
        return errorResponse('Email is already in use')
      }
    }

    // Build update data
    const data: Record<string, unknown> = {}
    if (email !== undefined) data.email = email
    if (name !== undefined) data.name = name
    if (nameAr !== undefined) data.nameAr = nameAr
    if (nameBn !== undefined) data.nameBn = nameBn
    if (nameUr !== undefined) data.nameUr = nameUr
    if (role !== undefined) data.role = role
    if (isActive !== undefined) data.isActive = isActive

    if (Object.keys(data).length === 0) {
      return errorResponse('No valid fields provided for update')
    }

    // PHASE 2: Use OCC-protected update
    const occVersion = parseOCCVersion(body)

    const updated = await occUpdate(
      prisma.user,
      id,
      occVersion,
      data,
      { companyId: user.companyId, deletedAt: null }
    )

    if (updated instanceof Response) return updated

    // Fetch with select for response
    const fullUpdated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        nameBn: true,
        nameUr: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await createAuditLog({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: { name: existing.name, email: existing.email, role: existing.role, isActive: existing.isActive },
        after: fullUpdated ? { name: fullUpdated.name, email: fullUpdated.email, role: fullUpdated.role, isActive: fullUpdated.isActive } : null,
        occProtected: !!occVersion,
      },
    })

    if (!fullUpdated) {
      return errorResponse('Failed to fetch updated user', 500)
    }

    return successResponse(serialize(fullUpdated))
  } catch (error) {
    console.error('Error updating user:', error)
    return errorResponse('Failed to update user', 500)
  }
}

// DELETE /api/users/[id] - Soft delete (deactivate) a user (admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isSystemAdmin(user.role)) {
      return forbiddenResponse('Only system admins can deactivate users')
    }

    const { id } = await params

    // Prevent admin from deactivating themselves
    if (id === user.id) {
      return errorResponse('You cannot deactivate your own account')
    }

    const existing = await prisma.user.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })

    if (!existing) {
      return errorResponse('User not found', 404)
    }

    if (!existing.isActive) {
      return errorResponse('User is already deactivated')
    }

    // Soft delete: set isActive to false and set deletedAt timestamp
    await prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    })

    await createAuditLog({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: { name: existing.name, email: existing.email, softDeactivate: true },
    })

    return successResponse({ message: 'User deactivated successfully' })
  } catch (error) {
    console.error('Error deactivating user:', error)
    return errorResponse('Failed to deactivate user', 500)
  }
}
