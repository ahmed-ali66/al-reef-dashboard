import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  safeDecimal,
  parsePaginationParams,
  paginatedResponse,
  isFinancialUser,
} from '@/lib/api-utils'

// GET /api/reservations - List reservations with pagination, filtering, and search
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)
    const status = searchParams.get('status')?.trim() || undefined
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const search = searchParams.get('search')?.trim() || undefined
    const financialAccess = isFinancialUser(user.role)

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    if (status) where.status = status
    if (propertyId) where.propertyId = propertyId
    if (search) {
      where.OR = [
        { prospectName: { contains: search, mode: 'insensitive' } },
        { prospectPhone: { contains: search } },
        { prospectEmail: { contains: search, mode: 'insensitive' } },
        { unitNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
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
            select: {
              id: true,
              name: true,
              nameAr: true,
              nameBn: true,
              nameUr: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.reservation.count({ where }),
    ])

    const result = reservations.map((r) => {
      const serialized = serialize(r) as any
      // Financial masking for staff — set depositAmount to 0
      if (!financialAccess) {
        serialized.depositAmount = 0
        serialized.depositAppliedAmount = 0
      }
      return serialized
    })

    return successResponse(paginatedResponse(result, total, pagination))
  } catch (error) {
    console.error('Failed to fetch reservations:', error)
    return errorResponse('Failed to fetch reservations', 500)
  }
}

// POST /api/reservations - Create a new reservation (all authenticated users)
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const body = await request.json()

    // Validate required fields
    if (!body.prospectName || !body.prospectPhone || !body.propertyId || body.depositAmount === undefined) {
      return errorResponse('Missing required fields: prospectName, prospectPhone, propertyId, depositAmount')
    }

    // NaN guard for depositAmount
    const parsedDepositAmount = safeDecimal(body.depositAmount)
    if (parsedDepositAmount < 0) return errorResponse('depositAmount must be zero or greater')

    // Verify the property belongs to the user's company
    const property = await prisma.property.findFirst({
      where: {
        id: body.propertyId,
        companyId: user.companyId,
        deletedAt: null,
      },
    })
    if (!property) {
      return errorResponse('Property not found or does not belong to your company')
    }

    // Check for double-booking: no active confirmed reservation for same property+unitNumber
    if (body.unitNumber) {
      const existingReservation = await prisma.reservation.findFirst({
        where: {
          propertyId: body.propertyId,
          unitNumber: body.unitNumber,
          status: 'confirmed',
          deletedAt: null,
        },
      })
      if (existingReservation) {
        return errorResponse('This unit already has an active confirmed reservation. Please cancel the existing reservation first.')
      }
    }

    const reservation = await prisma.reservation.create({
      data: {
        companyId: user.companyId,
        propertyId: body.propertyId,
        groupId: body.groupId || null,
        unitNumber: body.unitNumber || null,
        prospectName: body.prospectName,
        prospectNameAr: body.prospectNameAr || null,
        prospectNameBn: body.prospectNameBn || null,
        prospectNameUr: body.prospectNameUr || null,
        prospectPhone: body.prospectPhone,
        prospectWhatsapp: body.prospectWhatsapp || null,
        prospectEmail: body.prospectEmail || null,
        expectedMoveInDate: body.expectedMoveInDate ? new Date(body.expectedMoveInDate) : null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        depositAmount: parsedDepositAmount,
        depositStatus: body.depositStatus || 'unpaid',
        depositPaymentMethod: body.depositPaymentMethod || null,
        depositReference: body.depositReference || null,
        depositPaymentDate: body.depositPaymentDate ? new Date(body.depositPaymentDate) : null,
        emiratesId: body.emiratesId || null,
        status: body.status || 'pending',
        notes: body.notes || null,
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

    await createAuditLog({
      action: 'CREATE',
      entity: 'Reservation',
      entityId: reservation.id,
      userId: user.id,
      companyId: user.companyId,
      details: { prospectName: reservation.prospectName, propertyId: reservation.propertyId, unitNumber: reservation.unitNumber, depositAmount: parsedDepositAmount },
    })

    return successResponse(serialize(reservation), 201)
  } catch (error) {
    console.error('Failed to create reservation:', error)
    return errorResponse('Failed to create reservation', 500)
  }
}
