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
  isFinancialUser,
  safeDecimal,
  safeInt,
  parseOCCVersion,
  occUpdate,
} from '@/lib/api-utils'

// GET /api/reservations/[id] - Get a single reservation by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params
    const financialAccess = isFinancialUser(user.role)

    const reservation = await prisma.reservation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            nameBn: true,
            nameUr: true,
          },
        },
        group: {
          select: { id: true, name: true, status: true },
        },
      },
    })

    if (!reservation) {
      return errorResponse('Reservation not found', 404)
    }

    const serialized = serialize(reservation) as any
    // Financial masking for staff
    if (!financialAccess) {
      serialized.depositAmount = 0
      serialized.depositAppliedAmount = 0
    }

    return successResponse(serialized)
  } catch (error) {
    console.error('Failed to fetch reservation:', error)
    return errorResponse('Failed to fetch reservation', 500)
  }
}

// PUT /api/reservations/[id] - Update a reservation
// Owner/admin can change status; all users can update notes
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params
    const body = await request.json()

    // Verify reservation exists and belongs to user's company
    const existing = await prisma.reservation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
    })

    if (!existing) {
      return errorResponse('Reservation not found', 404)
    }

    // Build update data
    const data: Record<string, unknown> = {}

    // Status changes — only owner/admin
    if (body.status !== undefined) {
      if (!isOwnerOrAdmin(user.role)) {
        return forbiddenResponse('Only owners and admins can change reservation status')
      }
      data.status = body.status
    }

    // Deposit status — only owner/admin
    if (body.depositStatus !== undefined) {
      if (!isOwnerOrAdmin(user.role)) {
        return forbiddenResponse('Only owners and admins can change deposit status')
      }
      data.depositStatus = body.depositStatus
    }

    // All users can update these fields
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.prospectName !== undefined) data.prospectName = body.prospectName
    if (body.prospectNameAr !== undefined) data.prospectNameAr = body.prospectNameAr || null
    if (body.prospectNameBn !== undefined) data.prospectNameBn = body.prospectNameBn || null
    if (body.prospectNameUr !== undefined) data.prospectNameUr = body.prospectNameUr || null
    if (body.prospectPhone !== undefined) data.prospectPhone = body.prospectPhone
    if (body.prospectWhatsapp !== undefined) data.prospectWhatsapp = body.prospectWhatsapp || null
    if (body.prospectEmail !== undefined) data.prospectEmail = body.prospectEmail || null
    if (body.unitNumber !== undefined) data.unitNumber = body.unitNumber || null
    if (body.expectedMoveInDate !== undefined) data.expectedMoveInDate = body.expectedMoveInDate ? new Date(body.expectedMoveInDate) : null
    if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null
    if (body.depositAmount !== undefined) data.depositAmount = safeDecimal(body.depositAmount)
    if (body.depositPaymentMethod !== undefined) data.depositPaymentMethod = body.depositPaymentMethod || null
    if (body.depositReference !== undefined) data.depositReference = body.depositReference || null
    if (body.depositAppliedTo !== undefined) data.depositAppliedTo = body.depositAppliedTo || null
    if (body.depositAppliedAmount !== undefined) data.depositAppliedAmount = safeDecimal(body.depositAppliedAmount)
    if (body.depositPaymentDate !== undefined) data.depositPaymentDate = body.depositPaymentDate ? new Date(body.depositPaymentDate) : null
    if (body.emiratesId !== undefined) data.emiratesId = body.emiratesId || null
    if (body.groupId !== undefined) data.groupId = body.groupId || null

    // Use OCC-protected update
    const occVersion = parseOCCVersion(body)
    const updated = await occUpdate(
      prisma.reservation,
      id,
      occVersion,
      data,
      { companyId: user.companyId, deletedAt: null }
    )

    if (updated instanceof Response) return updated

    // Fetch full record with relations
    const fullReservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            nameBn: true,
            nameUr: true,
          },
        },
        group: {
          select: { id: true, name: true, status: true },
        },
      },
    })

    if (!fullReservation) {
      return errorResponse('Failed to fetch updated reservation', 500)
    }

    await createAuditLog({
      action: 'UPDATE',
      entity: 'Reservation',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        before: serialize(existing),
        after: serialize(fullReservation),
        occProtected: !!occVersion,
      },
    })

    return successResponse(serialize(fullReservation))
  } catch (error) {
    console.error('Failed to update reservation:', error)
    return errorResponse('Failed to update reservation', 500)
  }
}

// PATCH /api/reservations/[id] - Confirm or cancel reservation
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner/admin can confirm/cancel
    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can confirm or cancel reservations')
    }

    const { id } = await params
    const body = await request.json()

    // Verify reservation exists and belongs to user's company
    const existing = await prisma.reservation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
    })

    if (!existing) {
      return errorResponse('Reservation not found', 404)
    }

    const action = body.action // 'confirm' or 'cancel'

    if (action === 'confirm') {
      if (existing.status !== 'pending') {
        return errorResponse('Only pending reservations can be confirmed')
      }

      // Check for double-booking again
      if (existing.unitNumber) {
        const duplicate = await prisma.reservation.findFirst({
          where: {
            propertyId: existing.propertyId,
            unitNumber: existing.unitNumber,
            status: 'confirmed',
            deletedAt: null,
            id: { not: id },
          },
        })
        if (duplicate) {
          return errorResponse('This unit already has an active confirmed reservation')
        }
      }

      const updated = await prisma.reservation.update({
        where: { id },
        data: { status: 'confirmed' },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              nameBn: true,
              nameUr: true,
            },
          },
          group: { select: { id: true, name: true, status: true } },
        },
      })

      await createAuditLog({
        action: 'UPDATE',
        entity: 'Reservation',
        entityId: id,
        userId: user.id,
        companyId: user.companyId,
        details: { action: 'confirm', prospectName: existing.prospectName },
      })

      return successResponse(serialize(updated))
    } else if (action === 'cancel') {
      if (existing.status === 'converted') {
        return errorResponse('Cannot cancel a converted reservation')
      }

      const updated = await prisma.reservation.update({
        where: { id },
        data: { status: 'cancelled' },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              nameBn: true,
              nameUr: true,
            },
          },
          group: { select: { id: true, name: true, status: true } },
        },
      })

      await createAuditLog({
        action: 'UPDATE',
        entity: 'Reservation',
        entityId: id,
        userId: user.id,
        companyId: user.companyId,
        details: { action: 'cancel', prospectName: existing.prospectName },
      })

      return successResponse(serialize(updated))
    } else {
      return errorResponse('Invalid action. Use "confirm" or "cancel"')
    }
  } catch (error) {
    console.error('Failed to patch reservation:', error)
    return errorResponse('Failed to update reservation status', 500)
  }
}

// DELETE /api/reservations/[id] - Soft delete reservation (owner/admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can delete reservations')
    }

    const { id } = await params

    const existing = await prisma.reservation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
    })

    if (!existing) {
      return errorResponse('Reservation not found', 404)
    }

    await prisma.reservation.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await createAuditLog({
      action: 'DELETE',
      entity: 'Reservation',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: { prospectName: existing.prospectName, softDelete: true },
    })

    return successResponse({ deleted: true, id })
  } catch (error) {
    console.error('Failed to delete reservation:', error)
    return errorResponse('Failed to delete reservation', 500)
  }
}
