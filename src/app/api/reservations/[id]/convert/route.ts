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
  safeDecimal,
  safeInt,
} from '@/lib/api-utils'

// POST /api/reservations/[id]/convert - Convert reservation to active tenancy
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // Only owner/admin can convert reservations
    if (!isOwnerOrAdmin(user.role)) {
      return forbiddenResponse('Only owners and admins can convert reservations to tenancy')
    }

    const { id } = await params
    const body = await request.json()

    // Validate required fields for conversion
    if (!body.depositAppliedTo || body.rentAmount === undefined) {
      return errorResponse('Missing required fields: depositAppliedTo, rentAmount')
    }

    // Validate depositAppliedTo
    const validApplyOptions = ['security_deposit', 'first_rent', 'advance', 'other']
    if (!validApplyOptions.includes(body.depositAppliedTo)) {
      return errorResponse(`Invalid depositAppliedTo. Must be one of: ${validApplyOptions.join(', ')}`)
    }

    const rentAmount = safeDecimal(body.rentAmount)
    if (rentAmount <= 0) return errorResponse('rentAmount must be greater than zero')

    // Verify reservation exists, belongs to company, and is confirmed
    const reservation = await prisma.reservation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
      },
    })

    if (!reservation) {
      return errorResponse('Reservation not found', 404)
    }

    if (reservation.status !== 'confirmed') {
      return errorResponse('Only confirmed reservations can be converted to tenancy')
    }

    if (reservation.convertedTenantId) {
      return errorResponse('This reservation has already been converted to a tenant')
    }

    // Calculate deposit applied amount
    const depositAppliedAmount = Number(reservation.depositAmount)

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create tenant from reservation data
      const leaseStart = body.leaseStart ? new Date(body.leaseStart) : new Date()
      const contractDuration = body.contractDuration ? safeInt(body.contractDuration) : 12
      const leaseEnd = body.leaseEnd
        ? new Date(body.leaseEnd)
        : new Date(leaseStart.getTime() + contractDuration * 30 * 24 * 60 * 60 * 1000)

      // Apply deposit based on depositAppliedTo
      let securityDeposit: number = 0
      let initialPaymentAmount: number = 0

      if (body.depositAppliedTo === 'security_deposit') {
        securityDeposit = depositAppliedAmount
      } else if (body.depositAppliedTo === 'first_rent') {
        initialPaymentAmount = depositAppliedAmount
      } else if (body.depositAppliedTo === 'advance') {
        // Split: half to security deposit, half to first rent
        securityDeposit = Number((depositAppliedAmount / 2).toFixed(2))
        initialPaymentAmount = Number((depositAppliedAmount - securityDeposit).toFixed(2))
      } else {
        // 'other' — just apply as security deposit by default
        securityDeposit = depositAppliedAmount
      }

      const tenant = await tx.tenant.create({
        data: {
          companyId: user.companyId,
          propertyId: reservation.propertyId,
          groupId: reservation.groupId, // inherit group from reservation (if grouped)
          name: reservation.prospectName,
          nameAr: reservation.prospectNameAr,
          nameBn: reservation.prospectNameBn,
          nameUr: reservation.prospectNameUr,
          phone: reservation.prospectPhone,
          whatsapp: reservation.prospectWhatsapp,
          email: reservation.prospectEmail,
          unitNumber: reservation.unitNumber,
          rentAmount: rentAmount,
          securityDeposit: securityDeposit > 0 ? securityDecimal(securityDeposit) : null,
          paymentMethod: body.paymentMethod || reservation.depositPaymentMethod || null,
          leaseStart,
          leaseEnd,
          contractDuration,
          status: 'active',
          notes: `Converted from reservation ${reservation.id}. Original prospect: ${reservation.prospectName}`,
        },
      })

      // 2. If deposit is applied to first rent, create an initial payment
      if (initialPaymentAmount > 0) {
        const now = new Date()
        await tx.payment.create({
          data: {
            companyId: user.companyId,
            tenantId: tenant.id,
            amount: initialPaymentAmount,
            date: now,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            method: body.paymentMethod || reservation.depositPaymentMethod || 'bank_transfer',
            reference: `Reservation deposit applied - ${reservation.id}`,
            notes: `Deposit from reservation ${reservation.id} applied to first rent`,
            isLate: false,
            daysLate: 0,
          },
        })
      }

      // 3. Update reservation status to converted
      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: {
          status: 'converted',
          convertedTenantId: tenant.id,
          depositAppliedTo: body.depositAppliedTo,
          depositAppliedAmount: depositAppliedAmount,
          depositStatus: 'paid',
        },
      })

      return { tenant, reservation: updatedReservation }
    })

    // Create audit log
    await createAuditLog({
      action: 'CREATE',
      entity: 'Tenant',
      entityId: result.tenant.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        action: 'convert_reservation',
        reservationId: id,
        prospectName: reservation.prospectName,
        depositAppliedTo: body.depositAppliedTo,
        depositAppliedAmount,
        rentAmount,
      },
    })

    await createAuditLog({
      action: 'UPDATE',
      entity: 'Reservation',
      entityId: id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        action: 'convert_to_tenant',
        tenantId: result.tenant.id,
        depositAppliedTo: body.depositAppliedTo,
      },
    })

    return successResponse({
      tenant: serialize(result.tenant),
      reservation: serialize(result.reservation),
    }, 201)
  } catch (error) {
    console.error('Failed to convert reservation:', error)
    return errorResponse('Failed to convert reservation to tenancy', 500)
  }
}

// Helper to convert number to safe decimal for Prisma
function securityDecimal(value: number): number {
  return Number(value.toFixed(2))
}
