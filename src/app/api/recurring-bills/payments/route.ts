import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
  parsePaginationParams,
  paginatedResponse,
} from '@/lib/api-utils'

// GET /api/recurring-bills/payments — list ALL payments across all bills for the company
// Supports month/year params for monthly context filtering
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const { searchParams } = new URL(request.url)
    const pagination = parsePaginationParams(searchParams)

    // Optional filters
    const serviceType = searchParams.get('serviceType') || undefined
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const paymentMethod = searchParams.get('paymentMethod') || undefined
    const search = searchParams.get('search') || undefined
    const targetMonth = searchParams.get('month')?.trim()
    const targetYear = searchParams.get('year')?.trim()

    const where: any = {
      companyId: user.companyId,
    }

    // Month/year filtering for payments: filter by paymentDate within the selected month
    if (targetMonth && targetYear) {
      const m = parseInt(targetMonth)
      const y = parseInt(targetYear)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999)
      where.paymentDate = { gte: monthStart, lte: monthEnd }
    } else if (dateFrom || dateTo) {
      // Legacy date range filter
      where.paymentDate = {}
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom)
      if (dateTo) where.paymentDate.lte = new Date(dateTo + 'T23:59:59.999')
    }

    // Filter by payment method
    if (paymentMethod) {
      where.paymentMethod = paymentMethod
    }

    // Filter by bill's service type or search query
    if (serviceType || search) {
      where.recurringBill = {
        deletedAt: null,
        ...(serviceType ? { serviceType } : {}),
      }
      if (search) {
        where.recurringBill.OR = [
          { providerName: { contains: search, mode: 'insensitive' } },
          { buildingName: { contains: search, mode: 'insensitive' } },
          { accountNumber: { contains: search, mode: 'insensitive' } },
          { serviceType: { contains: search, mode: 'insensitive' } },
        ]
      }
    } else {
      // Always exclude payments for soft-deleted bills
      where.recurringBill = { deletedAt: null }
    }

    const [payments, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          recurringBill: {
            select: {
              id: true,
              providerName: true,
              serviceType: true,
              buildingName: true,
              accountNumber: true,
              currentOutstanding: true,
              totalAmountDue: true,
              property: {
                select: { id: true, name: true, nameAr: true, nameBn: true, nameUr: true },
              },
            },
          },
          billCycle: {
            select: {
              id: true,
              amount: true,
              periodStart: true,
              periodEnd: true,
              status: true,
            },
          },
        },
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
        if (payment.recurringBill) {
          payment.recurringBill.currentOutstanding = 0
          payment.recurringBill.totalAmountDue = 0
        }
      }
      return payment
    })

    return successResponse(paginatedResponse(serializedPayments, total, pagination))
  } catch (error) {
    console.error('Error fetching all bill payments:', error)
    return errorResponse('Failed to fetch bill payments', 500)
  }
}
