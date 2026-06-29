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
  safeNumber,
  safeDecimal,
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'

// GET /api/payments — list payments with pagination (scoped to user's company)
// Query params: ?month=X&year=Y&tenantId=Z&page=N&limit=N
// Staff can view payments but amounts are masked (set to 0) for non-financial users
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const financialAccess = isFinancialUser(user.role)

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const tenantId = searchParams.get('tenantId')
    const pagination = parsePaginationParams(searchParams)

    const where: any = {
      companyId: user.companyId, // Direct company reference — no JOIN needed
    }

    if (month) where.month = safeNumber(month, 0) || undefined
    if (year) where.year = safeNumber(year, 0) || undefined
    if (tenantId) where.tenantId = tenantId

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              unitNumber: true,
              propertyId: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.payment.count({ where }),
    ])

    // Mask amounts for non-financial users (staff) — they can see payment records but not amounts
    const serializedPayments = payments.map(serialize)
    const mappedPayments = financialAccess
      ? serializedPayments
      : serializedPayments.map((p: any) => ({ ...p, amount: 0 }))

    return successResponse(paginatedResponse(mappedPayments, total, pagination))
  } catch (error) {
    console.error('Error fetching payments:', error)
    return errorResponse('Failed to fetch payments', 500)
  }
}

// POST /api/payments — create a new payment
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const body = await request.json()

    const {
      tenantId,
      amount,
      date,
      month,
      year,
      method,
      reference,
      receiptNumber,
      notes,
      isLate,
      daysLate,
      allocationType,
    } = body

    // Validate required fields
    if (!tenantId) return errorResponse('tenantId is required')
    if (amount === undefined || amount === null) return errorResponse('amount is required')
    if (!date) return errorResponse('date is required')
    if (month === undefined || month === null) return errorResponse('month is required')
    if (year === undefined || year === null) return errorResponse('year is required')

    // PHASE 3: Use safeDecimal for monetary precision
    const parsedAmount = safeDecimal(amount)
    if (parsedAmount <= 0) return errorResponse('amount must be greater than zero')
    const parsedMonth = safeNumber(month, 0)
    const parsedYear = safeNumber(year, 0)
    if (!parsedMonth || !parsedYear) return errorResponse('Invalid month or year')

    // Verify the tenant belongs to the user's company
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, companyId: user.companyId, deletedAt: null },
    })
    if (!tenant) {
      return errorResponse('Tenant not found or does not belong to your company', 404)
    }

    const parsedIsLate = isLate === true
    const parsedDaysLate = parsedIsLate ? safeNumber(daysLate, 0) : 0

    // Validate allocationType
    const validAllocationTypes = ['CURRENT_RENT', 'HISTORICAL_DEBT', 'ADVANCE_PAYMENT']
    const parsedAllocationType = allocationType && validAllocationTypes.includes(allocationType)
      ? allocationType
      : 'CURRENT_RENT'

    // PHASE 1 FIX: Wrap multi-step operation in transaction
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          companyId: user.companyId,
          tenantId,
          amount: parsedAmount,
          date: new Date(date),
          month: parsedMonth,
          year: parsedYear,
          method: method || null,
          reference: reference || null,
          receiptNumber: receiptNumber || null,
          notes: notes || null,
          isLate: parsedIsLate,
          daysLate: parsedDaysLate,
          allocationType: parsedAllocationType,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              unitNumber: true,
              propertyId: true,
            },
          },
        },
      })

      // If late payment, update tenant's latePaymentCount, systemScore, and tenantScore
      if (parsedIsLate) {
        const newLatePaymentCount = tenant.latePaymentCount + 1
        const newSystemScore = Math.max(0, (tenant.systemScore ?? tenant.tenantScore) - 5)
        // Only update tenantScore if there's no active manual override
        const hasOverride = tenant.manualScoreOverride !== null && tenant.manualScoreOverride !== undefined
        const newTenantScore = hasOverride ? tenant.tenantScore : newSystemScore

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            latePaymentCount: newLatePaymentCount,
            tenantScore: newTenantScore,
            systemScore: newSystemScore,
          },
        })
      }

      // Phase 1 Rental Accounting: Handle allocation type business logic
      if (parsedAllocationType === 'ADVANCE_PAYMENT') {
        // ADVANCE_PAYMENT: evaluated against the TARGET month (parsedMonth/parsedYear).
        // If total payments for the target month exceed monthly charges, the excess
        // becomes credit balance (applied to future months by the monthly rollover).
        //
        // The payment has already been CREATED above (inside this transaction), so
        // the findMany below will include it. We do NOT add parsedAmount again —
        // currentPaid already reflects the total including this payment.
        //
        // BUG FIX (previous version): The old code did `currentPaid + parsedAmount`,
        // which double-counted the new payment (currentPaid already included it).
        // This caused a AED 3,000 advance payment for a AED 3,000 rent to generate
        // AED 3,000 excess credit (3,000 existing + 3,000 new - 3,000 charges = 3,000).
        // The correct result is 0 excess (3,000 total paid - 3,000 charges = 0).
        const currentPeriodPayments = await tx.payment.findMany({
          where: {
            tenantId,
            month: parsedMonth,
            year: parsedYear,
            allocationType: { in: ['CURRENT_RENT', 'ADVANCE_PAYMENT'] },
          },
        })
        const totalPaidForMonth = currentPeriodPayments.reduce((sum, p) => sum + Number(p.amount), 0)
        const rentAmount = Number(tenant.rentAmount)
        const munFee = Number(tenant.municipalityFee) || 0
        const monthlyCharges = rentAmount + munFee
        // Excess = total paid for the month (INCLUDING this payment) minus monthly charges
        const excessForCredit = Math.max(0, totalPaidForMonth - monthlyCharges)

        if (excessForCredit > 0) {
          // Add excess to creditBalance
          const currentCredit = Number(tenant.creditBalance) || 0
          await tx.tenant.update({
            where: { id: tenantId },
            data: { creditBalance: currentCredit + excessForCredit },
          })
        }
      } else if (parsedAllocationType === 'HISTORICAL_DEBT') {
        // Reduce openingBalance by payment amount (down to 0 minimum)
        const currentOpening = Number(tenant.openingBalance) || 0
        const newOpening = Math.max(0, currentOpening - parsedAmount)
        await tx.tenant.update({
          where: { id: tenantId },
          data: { openingBalance: newOpening },
        })
      }

      return created
    })

    // Audit log (outside transaction — should not rollback payment on audit failure)
    await createAuditLog({
      action: 'CREATE',
      entity: 'Payment',
      entityId: payment.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        amount: parsedAmount,
        tenantId,
        month: parsedMonth,
        year: parsedYear,
        isLate: parsedIsLate,
        daysLate: parsedDaysLate,
        allocationType: parsedAllocationType,
      },
    })

    return successResponse(serialize(payment), 201)
  } catch (error) {
    console.error('Error creating payment:', error)
    return errorResponse('Failed to create payment', 500)
  }
}
