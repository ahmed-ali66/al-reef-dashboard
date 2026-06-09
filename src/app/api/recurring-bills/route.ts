import prisma from '@/lib/db'
import {
  getAuthUser,
  createAuditLog,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeDecimal,
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'

const VALID_SERVICE_TYPES = [
  'electricity',
  'water',
  'etisalat',
  'du',
  'internet',
  'municipality',
  'service_charge',
  'waste',
  'maintenance_contract',
  'security_contract',
  'cleaning_contract',
  'custom',
]

// GET /api/recurring-bills — list recurring bills with pagination and filtering (non-deleted) for the company
// Query params:
//   - serviceType: filter by service type
//   - status: filter by status (active, paused, cancelled)
//   - propertyId: filter by property
//   - overdue: boolean — bills where nextDueDate < today and status = active
//   - upcoming: boolean — bills due in next 30 days
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can view recurring bills
    // Staff see amounts masked (handled below)

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)
    const serviceType = searchParams.get('serviceType')?.trim() || undefined
    const status = searchParams.get('status')?.trim() || undefined
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const overdue = searchParams.get('overdue')?.trim() === 'true'
    const upcoming = searchParams.get('upcoming')?.trim() === 'true'

    const where: any = {
      companyId: user.companyId,
      deletedAt: null, // exclude soft-deleted
    }

    if (serviceType) where.serviceType = serviceType
    if (status) where.status = status
    if (propertyId) where.propertyId = propertyId

    const now = new Date()

    if (overdue) {
      where.nextDueDate = { lt: now }
      where.status = 'active'
    } else if (upcoming) {
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      where.nextDueDate = {
        gte: now,
        lte: thirtyDaysFromNow,
      }
    }

    const [bills, total] = await Promise.all([
      prisma.recurringBill.findMany({
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
          _count: {
            select: { payments: true },
          },
        },
        orderBy: { nextDueDate: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.recurringBill.count({ where }),
    ])

    // Mask amounts for non-financial users (staff)
    const financialAccess = isFinancialUser(user.role)
    const amountFields = [
      'monthlyExpectedAmount',
      'currentOutstanding',
      'previousOutstanding',
      'totalAmountDue',
      'lastPaymentAmount',
    ]
    const serializedBills = bills.map(serialize).map((bill: any) => {
      if (!financialAccess) {
        for (const f of amountFields) {
          if (f in bill) bill[f] = 0
        }
      }
      return bill
    })

    return successResponse(paginatedResponse(serializedBills, total, pagination))
  } catch (error) {
    console.error('Error fetching recurring bills:', error)
    return errorResponse('Failed to fetch recurring bills', 500)
  }
}

// POST /api/recurring-bills — create a new recurring bill
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can create recurring bills
    const body = await request.json()

    const {
      propertyId,
      providerName,
      serviceType,
      accountNumber,
      customerNumber,
      contractNumber,
      monthlyExpectedAmount,
      nextDueDate,
      billingFrequency,
      autoRenew,
      gracePeriodDays,
      notes,
      buildingName,
      ownerName,
      propertyManager,
    } = body

    // Validate required fields
    if (!propertyId) return errorResponse('propertyId is required')
    if (!providerName) return errorResponse('providerName is required')
    if (!serviceType) return errorResponse('serviceType is required')
    if (monthlyExpectedAmount === undefined || monthlyExpectedAmount === null)
      return errorResponse('monthlyExpectedAmount is required')
    if (!nextDueDate) return errorResponse('nextDueDate is required')
    if (!billingFrequency) return errorResponse('billingFrequency is required')

    // Validate serviceType
    if (!VALID_SERVICE_TYPES.includes(serviceType)) {
      return errorResponse(
        `serviceType must be one of: ${VALID_SERVICE_TYPES.join(', ')}`
      )
    }

    // Validate property belongs to company
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId: user.companyId, deletedAt: null },
    })
    if (!property) {
      return errorResponse('Property not found or does not belong to your company', 404)
    }

    // PHASE 3: Use safeDecimal for monetary precision
    const parsedMonthlyExpectedAmount = safeDecimal(monthlyExpectedAmount)
    if (parsedMonthlyExpectedAmount <= 0)
      return errorResponse('monthlyExpectedAmount must be greater than zero')

    // On creation, currentOutstanding is 0, so totalAmountDue = monthlyExpectedAmount
    const currentOutstanding = 0
    const totalAmountDue = parsedMonthlyExpectedAmount

    const bill = await prisma.recurringBill.create({
      data: {
        companyId: user.companyId,
        propertyId,
        providerName,
        serviceType,
        accountNumber: accountNumber || null,
        customerNumber: customerNumber || null,
        contractNumber: contractNumber || null,
        monthlyExpectedAmount: parsedMonthlyExpectedAmount,
        currentOutstanding,
        previousOutstanding: 0,
        totalAmountDue,
        nextDueDate: new Date(nextDueDate),
        billingFrequency,
        autoRenew: autoRenew !== undefined ? autoRenew === true : true,
        gracePeriodDays: gracePeriodDays || 0,
        status: 'active',
        notes: notes || null,
        buildingName: buildingName || null,
        ownerName: ownerName || null,
        propertyManager: propertyManager || null,
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
      },
    })

    // Audit log
    await createAuditLog({
      action: 'CREATE',
      entity: 'RecurringBill',
      entityId: bill.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        propertyId,
        providerName,
        serviceType,
        monthlyExpectedAmount: parsedMonthlyExpectedAmount,
        totalAmountDue,
        nextDueDate,
        billingFrequency,
      },
    })

    return successResponse(serialize(bill), 201)
  } catch (error) {
    console.error('Error creating recurring bill:', error)
    return errorResponse('Failed to create recurring bill', 500)
  }
}
