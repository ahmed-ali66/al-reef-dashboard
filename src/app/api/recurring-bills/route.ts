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

// Service type sort order — defines the tertiary sort for Building > Unit > Type
const SERVICE_TYPE_SORT_ORDER: Record<string, number> = {
  electricity: 1,
  water: 2,
  etisalat: 3,
  du: 4,
  internet: 5,
  municipality: 6,
  service_charge: 7,
  waste: 8,
  maintenance_contract: 9,
  security_contract: 10,
  cleaning_contract: 11,
  custom: 12,
}

// GET /api/recurring-bills — list recurring bills with pagination and filtering
// Query params:
//   - serviceType: filter by service type
//   - status: filter by status (active, paused, cancelled)
//   - propertyId: filter by property
//   - overdue: boolean — bills with overdue cycles
//   - upcoming: boolean — bills due in next 30 days
//   - month: target month (1-12) — filters bills with cycles due in this month
//   - year: target year — combined with month for monthly context
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)
    const serviceType = searchParams.get('serviceType')?.trim() || undefined
    const status = searchParams.get('status')?.trim() || undefined
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const overdue = searchParams.get('overdue')?.trim() === 'true'
    const upcoming = searchParams.get('upcoming')?.trim() === 'true'
    const targetMonth = searchParams.get('month')?.trim()
    const targetYear = searchParams.get('year')?.trim()

    const now = new Date()
    // FIX: Use start-of-day for overdue/upcoming comparisons
    // "Overdue ONLY IF: currentDate > dueDate" — bills due today are NOT overdue
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    if (serviceType) where.serviceType = serviceType
    if (status) where.status = status
    if (propertyId) where.propertyId = propertyId

    // Month/year filtering: only show bills with cycles due in the selected month
    if (targetMonth && targetYear) {
      const m = parseInt(targetMonth)
      const y = parseInt(targetYear)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999)

      // If we already have a bill-level date filter (overdue/upcoming), use nextDueDate
      if (overdue) {
        where.status = 'active'
        where.nextDueDate = { lt: startOfToday, gte: monthStart, lte: monthEnd }
        where.currentOutstanding = { gt: 0 }
      } else if (upcoming) {
        const thirtyDaysFromNow = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)
        where.status = 'active'
        where.nextDueDate = { gte: startOfToday, lte: thirtyDaysFromNow }
      } else {
        // Default: bills with any cycle due in the selected month
        where.cycles = {
          some: {
            dueDate: { gte: monthStart, lte: monthEnd },
          },
        }
      }
    } else if (overdue) {
      where.status = 'active'
      where.nextDueDate = { lt: startOfToday }
      where.currentOutstanding = { gt: 0 }
    } else if (upcoming) {
      const thirtyDaysFromNow = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)
      where.status = 'active'
      where.nextDueDate = { gte: startOfToday, lte: thirtyDaysFromNow }
    }

    // Determine month boundaries for cycle filtering
    let cycleMonthFilter: any = undefined
    if (targetMonth && targetYear) {
      const m = parseInt(targetMonth)
      const y = parseInt(targetYear)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999)
      cycleMonthFilter = { dueDate: { gte: monthStart, lte: monthEnd } }
    }

    const cycleWhere = cycleMonthFilter
      ? {
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          ...cycleMonthFilter,
        }
      : { status: { in: ['pending', 'partially_paid', 'overdue'] } }

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
          cycles: {
            where: cycleWhere,
            orderBy: { dueDate: 'desc' },
            take: 1,
            include: {
              _count: { select: { payments: true } },
            },
          },
        },
        // Primary sort: property name (building), then buildingName, then serviceType
        orderBy: [
          { property: { name: 'asc' } },
          { buildingName: 'asc' },
          { serviceType: 'asc' },
        ],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.recurringBill.count({ where }),
    ])

    // Mask amounts for non-financial users (staff)
    const financialAccess = isFinancialUser(user.role)
    const amountFields = [
      'currentOutstanding',
      'previousOutstanding',
      'totalAmountDue',
      'lastPaymentAmount',
    ]
    const serializedBills = bills.map(serialize).map((bill: any) => {
      // ARCHITECTURE: Do NOT modify totalAmountDue from cycle data.
      // totalAmountDue is a stored DB field — if it needs correction,
      // fix it at the source (DB update), not by overriding in read paths.
      // Previous "correctedBills" logic caused data inconsistencies.

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

    const body = await request.json()

    const {
      propertyId,
      providerName,
      serviceType,
      accountNumber,
      contractNumber,
      currentOutstanding,
      nextDueDate,
      billingFrequency,
      autoRenew,
      gracePeriodDays,
      notes,
      buildingName,
      ownerName,
      propertyManager,
    } = body

    if (!propertyId) return errorResponse('propertyId is required')
    if (!providerName) return errorResponse('providerName is required')
    if (!serviceType) return errorResponse('serviceType is required')
    if (!nextDueDate) return errorResponse('nextDueDate is required')
    if (!billingFrequency) return errorResponse('billingFrequency is required')

    if (!VALID_SERVICE_TYPES.includes(serviceType)) {
      return errorResponse(
        `serviceType must be one of: ${VALID_SERVICE_TYPES.join(', ')}`
      )
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId: user.companyId, deletedAt: null },
    })
    if (!property) {
      return errorResponse('Property not found or does not belong to your company', 404)
    }

    // Check for duplicate account number
    if (accountNumber && accountNumber.trim()) {
      const existingBill = await prisma.recurringBill.findFirst({
        where: {
          companyId: user.companyId,
          accountNumber: accountNumber.trim(),
          deletedAt: null,
        },
        include: {
          property: { select: { name: true } },
        },
      })
      if (existingBill) {
        return errorResponse(
          `An account with this Account Number already exists. Provider: ${existingBill.providerName}, Property: ${existingBill.property?.name || existingBill.buildingName || 'N/A'}. Please review the existing record before creating another one.`,
          409
        )
      }
    }

    const parsedCurrentOutstanding = safeDecimal(currentOutstanding || 0)
    if (parsedCurrentOutstanding < 0)
      return errorResponse('currentOutstanding cannot be negative')

    const totalAmountDue = parsedCurrentOutstanding

    const bill = await prisma.recurringBill.create({
      data: {
        companyId: user.companyId,
        propertyId,
        providerName,
        serviceType,
        accountNumber: accountNumber || null,
        contractNumber: contractNumber || null,
        currentOutstanding: parsedCurrentOutstanding,
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

    // Create the first billing cycle
    await prisma.billCycle.create({
      data: {
        companyId: user.companyId,
        recurringBillId: bill.id,
        periodStart: new Date(new Date(nextDueDate).getTime() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(new Date(nextDueDate).getTime() - 24 * 60 * 60 * 1000),
        dueDate: new Date(nextDueDate),
        amount: totalAmountDue,
        paidAmount: 0,
        outstandingAmount: totalAmountDue,
        status: 'pending',
      },
    })

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
        currentOutstanding: parsedCurrentOutstanding,
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
