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

// GET /api/tenant-groups — list tenant groups for the company
// Query params: ?propertyId=X&status=active
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const status = searchParams.get('status')

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }
    if (propertyId) where.propertyId = propertyId
    if (status) where.status = status

    const groups = await prisma.tenantGroup.findMany({
      where,
      include: {
        tenants: {
          where: { deletedAt: null, status: { in: ['active', 'notice'] } },
          select: {
            id: true,
            name: true,
            unitNumber: true,
            rentAmount: true,
            municipalityFee: true,
            openingBalance: true,
            creditBalance: true,
            status: true,
          },
        },
        reservations: {
          where: { deletedAt: null },
          select: {
            id: true,
            prospectName: true,
            unitNumber: true,
            depositAmount: true,
            depositStatus: true,
            status: true,
          },
        },
        property: {
          select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(groups.map(serialize))
  } catch (error) {
    console.error('Error fetching tenant groups:', error)
    return errorResponse('Failed to fetch tenant groups', 500)
  }
}

// POST /api/tenant-groups — create a new tenant group
// Body: { propertyId, name, nameAr?, nameBn?, nameUr?, billingMode?, notes?, tenantIds?: string[], reservationIds?: string[] }
// - tenantIds: existing tenants to link to this group
// - reservationIds: existing reservations to link to this group
// - If neither is provided, an empty group is created (members can be added later)
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) return forbiddenResponse()

    const body = await request.json()
    const { propertyId, name, nameAr, nameBn, nameUr, billingMode, notes, tenantIds, reservationIds } = body

    if (!propertyId) return errorResponse('propertyId is required')
    if (!name) return errorResponse('name is required')

    // Verify property belongs to the user's company
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId: user.companyId },
    })
    if (!property) return errorResponse('Property not found', 404)

    // Validate tenantIds if provided
    if (tenantIds && tenantIds.length > 0) {
      const tenants = await prisma.tenant.findMany({
        where: {
          id: { in: tenantIds },
          companyId: user.companyId,
          propertyId,
          deletedAt: null,
        },
      })
      if (tenants.length !== tenantIds.length) {
        return errorResponse('One or more tenants not found or do not belong to this property')
      }
      // Check that none of the tenants are already in a group
      const alreadyGrouped = tenants.filter(t => t.groupId !== null)
      if (alreadyGrouped.length > 0) {
        return errorResponse(`Tenants already in a group: ${alreadyGrouped.map(t => t.name).join(', ')}`)
      }
    }

    // Validate reservationIds if provided
    if (reservationIds && reservationIds.length > 0) {
      const reservations = await prisma.reservation.findMany({
        where: {
          id: { in: reservationIds },
          companyId: user.companyId,
          propertyId,
          deletedAt: null,
        },
      })
      if (reservations.length !== reservationIds.length) {
        return errorResponse('One or more reservations not found or do not belong to this property')
      }
      const alreadyGrouped = reservations.filter(r => r.groupId !== null)
      if (alreadyGrouped.length > 0) {
        return errorResponse(`Reservations already in a group`)
      }
    }

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.tenantGroup.create({
        data: {
          companyId: user.companyId,
          propertyId,
          name,
          nameAr: nameAr || null,
          nameBn: nameBn || null,
          nameUr: nameUr || null,
          billingMode: billingMode || 'consolidated',
          status: 'active',
          notes: notes || null,
        },
      })

      // Link tenants to the group
      if (tenantIds && tenantIds.length > 0) {
        await tx.tenant.updateMany({
          where: { id: { in: tenantIds }, companyId: user.companyId },
          data: { groupId: created.id },
        })
      }

      // Link reservations to the group
      if (reservationIds && reservationIds.length > 0) {
        await tx.reservation.updateMany({
          where: { id: { in: reservationIds }, companyId: user.companyId },
          data: { groupId: created.id },
        })
      }

      return created
    })

    // Fetch the full group with tenants and reservations for the response
    const fullGroup = await prisma.tenantGroup.findUnique({
      where: { id: group.id },
      include: {
        tenants: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            unitNumber: true,
            rentAmount: true,
          },
        },
        reservations: {
          where: { deletedAt: null },
          select: {
            id: true,
            prospectName: true,
            unitNumber: true,
            depositAmount: true,
            status: true,
          },
        },
        property: {
          select: { id: true, name: true },
        },
      },
    })

    await createAuditLog({
      action: 'CREATE',
      entity: 'TenantGroup',
      entityId: group.id,
      userId: user.id,
      companyId: user.companyId,
      details: { name, propertyId, tenantIds, reservationIds },
    })

    return successResponse(serialize(fullGroup!), 201)
  } catch (error) {
    console.error('Error creating tenant group:', error)
    return errorResponse('Failed to create tenant group', 500)
  }
}
