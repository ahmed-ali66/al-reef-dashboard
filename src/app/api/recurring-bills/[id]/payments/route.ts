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

// GET /api/recurring-bills/[id]/payments — list payments for a specific bill
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { id } = await params

    // Verify bill exists and belongs to user's company
    const bill = await prisma.recurringBill.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!bill) {
      return errorResponse('Recurring bill not found', 404)
    }

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)

    const where = {
      recurringBillId: id,
      companyId: user.companyId,
    }

    const [payments, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.billPayment.count({ where }),
    ])

    // Mask amounts for non-financial users (staff)
    const financialAccess = isFinancialUser(user.role)
    const amountFields = ['amount', 'outstandingBefore', 'outstandingAfter']
    const serializedPayments = payments.map(serialize).map((payment: any) => {
      if (!financialAccess) {
        for (const f of amountFields) {
          if (f in payment) payment[f] = 0
        }
      }
      return payment
    })

    return successResponse(paginatedResponse(serializedPayments, total, pagination))
  } catch (error) {
    console.error('Error fetching bill payments:', error)
    return errorResponse('Failed to fetch bill payments', 500)
  }
}

// POST /api/recurring-bills/[id]/payments — record a payment for a bill
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can record payments
    const { id } = await params

    // Verify bill exists and belongs to user's company
    const bill = await prisma.recurringBill.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    })
    if (!bill) {
      return errorResponse('Recurring bill not found', 404)
    }

    const body = await request.json()

    const { amount, paymentDate, paymentMethod, reference, notes } = body

    // Validate required fields
    if (amount === undefined || amount === null) return errorResponse('amount is required')
    if (!paymentDate) return errorResponse('paymentDate is required')

    // PHASE 3: Use safeDecimal for monetary precision
    const parsedAmount = safeDecimal(amount)
    if (parsedAmount <= 0) return errorResponse('amount must be greater than zero')

    // Calculate outstanding before and after
    const outstandingBefore = safeDecimal(bill.currentOutstanding)
    const outstandingAfter = Math.max(0, outstandingBefore - parsedAmount)

    // Create the payment and update the bill in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the payment record
      const payment = await tx.billPayment.create({
        data: {
          companyId: user.companyId,
          recurringBillId: id,
          amount: parsedAmount,
          paymentDate: new Date(paymentDate),
          paymentMethod: paymentMethod || null,
          reference: reference || null,
          notes: notes || null,
          outstandingBefore,
          outstandingAfter: safeDecimal(outstandingAfter),
          createdBy: user.id,
        },
      })

      // Update the bill
      const newTotalAmountDue = safeDecimal(bill.monthlyExpectedAmount) + safeDecimal(outstandingAfter)
      await tx.recurringBill.update({
        where: { id },
        data: {
          currentOutstanding: safeDecimal(outstandingAfter),
          lastPaymentAmount: parsedAmount,
          lastPaymentDate: new Date(paymentDate),
          totalAmountDue: newTotalAmountDue,
        },
      })

      return payment
    })

    // Audit log
    await createAuditLog({
      action: 'CREATE',
      entity: 'BillPayment',
      entityId: result.id,
      userId: user.id,
      companyId: user.companyId,
      details: {
        recurringBillId: id,
        amount: parsedAmount,
        paymentDate,
        outstandingBefore,
        outstandingAfter: safeDecimal(outstandingAfter),
        paymentMethod: paymentMethod || null,
        reference: reference || null,
      },
    })

    return successResponse(serialize(result), 201)
  } catch (error) {
    console.error('Error recording bill payment:', error)
    return errorResponse('Failed to record bill payment', 500)
  }
}
