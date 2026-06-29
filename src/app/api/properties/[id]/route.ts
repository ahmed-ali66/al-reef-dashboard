import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnerOrAdmin,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'
import { isFinancialUser } from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'

// Valid property types
const VALID_PROPERTY_TYPES = ['apartment', 'villa', 'office', 'shop', 'studio', 'mixed_use']

// Helper: find a property scoped to the user's company, excluding soft-deleted
async function findPropertyForUser(id: string, companyId: string) {
  return prisma.property.findFirst({
    where: {
      id,
      companyId,
      deletedAt: null,
    },
    include: {
      tenants: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
        },
      },
    },
  })
}

// GET /api/properties/[id] — Get a single property
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    const property = await findPropertyForUser(id, user.companyId)

    if (!property) {
      return errorResponse('Property not found', 404)
    }

    // Compute tenant counts
    const { tenants, ...propertyData } = property
    const tenantCount = tenants.length
    const activeTenantCount = tenants.filter((t) => FINANCIALLY_ACTIVE_STATUSES.includes(t.status as any)).length

    const result = {
      ...propertyData,
      tenantCount,
      activeTenantCount,
    }

    return successResponse(serialize(result))
  } catch (error) {
    console.error(`GET /api/properties/[id] error:`, error)
    return errorResponse('Failed to fetch property', 500)
  }
}

// PUT /api/properties/[id] — Update a property (owner/admin only + OCC)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // PHASE 2: RBAC — only owner/admin can update properties
    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can update properties')
    }

    const { id } = await params

    const existing = await findPropertyForUser(id, user.companyId)

    if (!existing) {
      return errorResponse('Property not found', 404)
    }

    const body = await request.json()

    // PHASE 2: Optimistic Concurrency Control
    const occVersion = parseOCCVersion(body)

    // Validate type if provided
    if (body.type !== undefined && !VALID_PROPERTY_TYPES.includes(body.type)) {
      return errorResponse(
        `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
      )
    }

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return errorResponse('Property name cannot be empty')
      }

      // Check for duplicate name (excluding the current property and soft-deleted)
      if (body.name.trim() !== existing.name) {
        const duplicate = await prisma.property.findFirst({
          where: {
            companyId: user.companyId,
            name: body.name.trim(),
            deletedAt: null,
            id: { not: id },
          },
        })
        if (duplicate) {
          return errorResponse('A property with this name already exists', 409)
        }
      }
    }

    // Validate numeric fields if provided
    if (body.totalUnits !== undefined) {
      const totalUnits = Number(body.totalUnits)
      if (isNaN(totalUnits) || totalUnits < 1) {
        return errorResponse('totalUnits must be a positive integer')
      }
    }

    if (body.floors !== undefined) {
      const floors = Number(body.floors)
      if (isNaN(floors) || floors < 1) {
        return errorResponse('floors must be a positive integer')
      }
    }

    // Build update data — only include fields that are provided
    const data: Record<string, any> = {}

    if (body.name !== undefined) data.name = body.name.trim()
    if (body.nameAr !== undefined) data.nameAr = body.nameAr?.trim() || null
    if (body.nameBn !== undefined) data.nameBn = body.nameBn?.trim() || null
    if (body.nameUr !== undefined) data.nameUr = body.nameUr?.trim() || null
    if (body.type !== undefined) data.type = body.type
    if (body.address !== undefined) data.address = body.address?.trim() || null
    if (body.totalUnits !== undefined) data.totalUnits = Number(body.totalUnits)
    if (body.floors !== undefined) data.floors = Number(body.floors)
    if (body.archived !== undefined) data.archived = Boolean(body.archived)
    if (body.isOperationalOnly !== undefined) data.isOperationalOnly = Boolean(body.isOperationalOnly)

    // Check if there are any fields to update
    if (Object.keys(data).length === 0) {
      return errorResponse('No valid fields provided for update')
    }

    // PHASE 2: Use OCC-protected update
    const updated = await occUpdate(
      prisma.property,
      id,
      occVersion,
      data,
      { companyId: user.companyId, deletedAt: null }
    )

    if (updated instanceof Response) return updated

    await createAuditLog({
      action: 'UPDATE',
      entity: 'Property',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: serialize(existing),
        after: serialize(updated),
        changedFields: Object.keys(data),
        occProtected: !!occVersion,
      },
    })

    return successResponse(serialize(updated))
  } catch (error) {
    console.error(`PUT /api/properties/[id] error:`, error)
    return errorResponse('Failed to update property', 500)
  }
}

// DELETE /api/properties/[id] — Soft delete a property + cascade (owner/admin only)
// PHASE 2: Cascade soft-delete to tenants + their payments within a transaction
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner/admin can delete properties
    if (!isFinancialUser(user.role)) {
      return forbiddenResponse('Only owners and admins can delete properties')
    }

    const { id } = await params

    const existing = await findPropertyForUser(id, user.companyId)

    if (!existing) {
      return errorResponse('Property not found', 404)
    }

    // Check for active tenants — warn but still allow soft delete
    const activeTenants = existing.tenants.filter((t) => FINANCIALLY_ACTIVE_STATUSES.includes(t.status as any))

    // PHASE 2/3: Cascade soft-delete within a transaction
    // PHASE 3: Also handle receipts (cascade delete like payments)
    const deletedProperty = await prisma.$transaction(async (tx) => {
      // 1. Hard-delete receipts and payments for all tenants of this property
      //    (Receipts/Payments don't have soft-delete; cascading via tenant)
      const propertyTenantIds = existing.tenants.map(t => t.id)

      if (propertyTenantIds.length > 0) {
        // PHASE 3: Delete receipts before payments (FK constraint order)
        await tx.receipt.deleteMany({
          where: { tenantId: { in: propertyTenantIds } },
        })

        await tx.payment.deleteMany({
          where: { tenantId: { in: propertyTenantIds } },
        })
      }

      // 2. Soft-delete all tenants of this property
      await tx.tenant.updateMany({
        where: {
          propertyId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
          status: 'inactive',
        },
      })

      // 3. Soft-delete the property itself
      const deleted = await tx.property.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      // 4. Soft-delete maintenance items linked to this property
      await tx.maintenance.updateMany({
        where: { propertyId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      })

      return deleted
    })

    await createAuditLog({
      action: 'DELETE',
      entity: 'Property',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: serialize(existing),
        activeTenantCount: activeTenants.length,
        totalTenantCount: existing.tenants.length,
        softDelete: true,
        cascadedToTenants: true,
        cascadedToMaintenance: true,
      },
    })

    return successResponse({
      ...serialize(deletedProperty),
      _meta: {
        softDeleted: true,
        activeTenantCount: activeTenants.length,
        totalTenantCount: existing.tenants.length,
        cascadedTenants: existing.tenants.length,
      },
    })
  } catch (error) {
    console.error(`DELETE /api/properties/[id] error:`, error)
    return errorResponse('Failed to delete property', 500)
  }
}

// PATCH /api/properties/[id] — Archive or unarchive a property (owner/admin only + OCC)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // PHASE 2: RBAC — only owner/admin can archive/unarchive properties
    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can archive properties')
    }

    const { id } = await params

    const existing = await findPropertyForUser(id, user.companyId)

    if (!existing) {
      return errorResponse('Property not found', 404)
    }

    const body = await request.json()

    // Validate the archived field
    if (body.archived === undefined || typeof body.archived !== 'boolean') {
      return errorResponse('Request body must include { archived: true } or { archived: false }')
    }

    // Skip update if the archived state is already set
    if (existing.archived === body.archived) {
      return successResponse({
        ...serialize(existing),
        _message: `Property is already ${body.archived ? 'archived' : 'active'}`,
      })
    }

    // PHASE 2: Use OCC-protected update
    const occVersion = parseOCCVersion(body)

    const updated = await occUpdate(
      prisma.property,
      id,
      occVersion,
      { archived: body.archived },
      { companyId: user.companyId, deletedAt: null }
    )

    if (updated instanceof Response) return updated

    await createAuditLog({
      action: body.archived ? 'ARCHIVE' : 'UNARCHIVE',
      entity: 'Property',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: { archived: existing.archived },
        after: { archived: body.archived },
        occProtected: !!occVersion,
      },
    })

    return successResponse(serialize(updated))
  } catch (error) {
    console.error(`PATCH /api/properties/[id] error:`, error)
    return errorResponse('Failed to update property archive status', 500)
  }
}
