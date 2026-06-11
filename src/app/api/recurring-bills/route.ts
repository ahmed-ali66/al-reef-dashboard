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
      // FIX: Use cycle-level overdue detection instead of bill-level nextDueDate.
      // A bill is overdue if it has any open cycle (pending/partially_paid/overdue)
      // with dueDate < now. The old logic checked bill.nextDueDate which misses
      // bills whose current cycle is past due but nextDueDate was already advanced.
      where.status = 'active'
      where.cycles = {
        some: {
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { lt: now },
        },
      }
    } else if (upcoming) {
      // FIX: Use cycle-level upcoming detection for consistency.
      // A bill is upcoming if it has any open cycle due within 30 days from now.
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      where.status = 'active'
      where.cycles = {
        some: {
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { gte: now, lte: thirtyDaysFromNow },
        },
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
          cycles: {
            where: { status: { in: ['pending', 'partially_paid', 'overdue'] } },
            orderBy: { dueDate: 'desc' },
            take: 1,
            include: {
              _count: { select: { payments: true } },
            },
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
      'currentOutstanding',
      'previousOutstanding',
      'totalAmountDue',
      'lastPaymentAmount',
    ]
    const serializedBills = bills.map(serialize).map((bill: any) => {
      // Fix totalAmountDue: derive from the latest open cycle's amount
      // This ensures consistency even for bills where totalAmountDue was
      // incorrectly overwritten to equal currentOutstanding after payments
      if (bill.cycles && bill.cycles.length > 0) {
        const latestCycle = bill.cycles[0] // cycles are ordered by dueDate desc
        const cycleAmount = parseFloat(String(latestCycle.amount))
        const storedTotalDue = parseFloat(String(bill.totalAmountDue))
        // If totalAmountDue equals currentOutstanding (the bug pattern),
        // or is zero, use the cycle amount instead
        if (storedTotalDue <= parseFloat(String(bill.currentOutstanding)) || storedTotalDue === 0) {
          bill.totalAmountDue = cycleAmount
        }
      }

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

    // Validate required fields
    if (!propertyId) return errorResponse('propertyId is required')
    if (!providerName) return errorResponse('providerName is required')
    if (!serviceType) return errorResponse('serviceType is required')
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

    // Check for duplicate account number within same company
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

    // PHASE 3: Use safeDecimal for monetary precision
    const parsedCurrentOutstanding = safeDecimal(currentOutstanding || 0)
    if (parsedCurrentOutstanding < 0)
      return errorResponse('currentOutstanding cannot be negative')

    // totalAmountDue = currentOutstanding (what is owed right now)
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
        periodStart: new Date(new Date(nextDueDate).getTime() - 30 * 24 * 60 * 60 * 1000), // approximate
        periodEnd: new Date(new Date(nextDueDate).getTime() - 24 * 60 * 60 * 1000),
        dueDate: new Date(nextDueDate),
        amount: totalAmountDue,
        paidAmount: 0,
        outstandingAmount: totalAmountDue,
        status: 'pending',
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
