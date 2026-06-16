import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isFinancialUser,
} from '@/lib/api-utils'

// GET /api/tenant-groups/[id] — get a single tenant group with full details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    const group = await prisma.tenantGroup.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        tenants: {
          where: { deletedAt: null },
          include: {
            payments: { where: { allocationType: { not: 'HISTORICAL_DEBT' } } },
            adjustments: { where: { status: 'approved' } },
          },
        },
        property: {
          select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true },
        },
      },
    })

    if (!group) return errorResponse('Tenant group not found', 404)

    return successResponse(serialize(group))
  } catch (error) {
    console.error('Error fetching tenant group:', error)
    return errorResponse('Failed to fetch tenant group', 500)
  }
}

// PUT /api/tenant-groups/[id] — update a tenant group
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) return forbiddenResponse()

    const { id } = await params
    const body = await request.json()
    const { name, nameAr, nameBn, nameUr, billingMode, notes, status, tenantIds } = body

    // Verify group exists and belongs to company
    const existing = await prisma.tenantGroup.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) return errorResponse('Tenant group not found', 404)

    const updated = await prisma.$transaction(async (tx) => {
      // Update group fields
      const group = await tx.tenantGroup.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(nameAr !== undefined && { nameAr }),
          ...(nameBn !== undefined && { nameBn }),
          ...(nameUr !== undefined && { nameUr }),
          ...(billingMode !== undefined && { billingMode }),
          ...(notes !== undefined && { notes }),
          ...(status !== undefined && { status }),
        },
      })

      // If tenantIds provided, update the group membership
      if (tenantIds !== undefined) {
        // Remove all existing group assignments for this group
        await tx.tenant.updateMany({
          where: { groupId: id, companyId: user.companyId },
          data: { groupId: null },
        })

        // Assign new tenants to the group
        if (tenantIds.length > 0) {
          await tx.tenant.updateMany({
            where: { id: { in: tenantIds }, companyId: user.companyId },
            data: { groupId: id },
          })
        }
      }

      return group
    })

    await createAuditLog({
      action: 'UPDATE',
      entity: 'TenantGroup',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: { name, billingMode, status, tenantIds },
    })

    return successResponse(serialize(updated))
  } catch (error) {
    console.error('Error updating tenant group:', error)
    return errorResponse('Failed to update tenant group', 500)
  }
}

// DELETE /api/tenant-groups/[id] — soft delete a tenant group
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) return forbiddenResponse()

    const { id } = await params

    const existing = await prisma.tenantGroup.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!existing) return errorResponse('Tenant group not found', 404)

    await prisma.$transaction(async (tx) => {
      // Unlink all tenants from this group
      await tx.tenant.updateMany({
        where: { groupId: id, companyId: user.companyId },
        data: { groupId: null },
      })

      // Soft delete the group
      await tx.tenantGroup.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'inactive' },
      })
    })

    await createAuditLog({
      action: 'DELETE',
      entity: 'TenantGroup',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
    })

    return successResponse({ deleted: true })
  } catch (error) {
    console.error('Error deleting tenant group:', error)
    return errorResponse('Failed to delete tenant group', 500)
  }
}
