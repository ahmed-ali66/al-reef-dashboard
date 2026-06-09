import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'

// GET /api/recurring-bills/summary — dashboard summary data for recurring bills
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can view summary
    const financialAccess = isFinancialUser(user.role)
    const now = new Date()

    // Start of current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // End of current month
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const baseWhere = {
      companyId: user.companyId,
      deletedAt: null,
    }

    // Run all queries in parallel for performance
    const [
      activeBills,
      outstandingAgg,
      dueThisMonthAgg,
      paidThisMonthAgg,
      upcomingBills,
      overdueBills,
      serviceTypeBreakdown,
      cycleAgg,
    ] = await Promise.all([
      // totalBills: count of active bills
      prisma.recurringBill.count({
        where: { ...baseWhere, status: 'active' },
      }),

      // totalOutstanding: sum of currentOutstanding across active bills
      prisma.recurringBill.aggregate({
        where: { ...baseWhere, status: 'active' },
        _sum: { currentOutstanding: true },
      }),

      // totalDueThisMonth: sum of latest cycle amount for bills due this month
      // Uses cycle amount instead of bill.totalAmountDue to avoid corrupted data
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { amount: true },
      }),

      // totalPaidThisMonth: sum of BillPayment amounts this month (exclude deleted bills)
      prisma.billPayment.aggregate({
        where: {
          companyId: user.companyId,
          paymentDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { deletedAt: null },
        },
        _sum: { amount: true },
      }),

      // upcomingBills: next 5 bills by due date (with property info)
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          nextDueDate: { gte: now },
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
        orderBy: { nextDueDate: 'asc' },
        take: 5,
      }),

      // overdueBills: bills where nextDueDate < today and status = active
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          nextDueDate: { lt: now },
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
        orderBy: { nextDueDate: 'asc' },
      }),

      // Group by serviceType for breakdown using cycle amounts
      // We query bills grouped by serviceType but use cycle amounts for accuracy
      prisma.recurringBill.groupBy({
        by: ['serviceType'],
        where: { ...baseWhere, status: 'active' },
        _sum: {
          currentOutstanding: true,
        },
        _count: true,
      }),

      // Cycle-level aggregation (exclude deleted bills)
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          recurringBill: { deletedAt: null },
        },
        _sum: { outstandingAmount: true, amount: true, paidAmount: true },
        _count: true,
      }),
    ])

    // Build financial mask helper for staff
    const financialMask = (obj: any, fields: string[]) => {
      if (financialAccess) return serialize(obj)
      const masked = { ...serialize(obj) }
      for (const f of fields) {
        if (f in masked) masked[f] = 0
      }
      return masked
    }

    const amountFields = [
      'currentOutstanding',
      'previousOutstanding',
      'totalAmountDue',
      'lastPaymentAmount',
    ]

    // Build response
    const data = {
      totalBills: activeBills,
      totalOutstanding: financialAccess
        ? safeNumber(outstandingAgg._sum.currentOutstanding)
        : 0,
      totalDueThisMonth: financialAccess
        ? safeNumber(dueThisMonthAgg._sum.amount)
        : 0,
      totalPaidThisMonth: financialAccess
        ? safeNumber(paidThisMonthAgg._sum.amount)
        : 0,
      upcomingBills: upcomingBills.map((bill) => financialMask(bill, amountFields)),
      overdueBills: overdueBills.map((bill) => financialMask(bill, amountFields)),
      serviceTypeBreakdown: serviceTypeBreakdown.map((item) => ({
        serviceType: item.serviceType,
        count: item._count,
        totalAmountDue: financialAccess
          ? safeNumber(item._sum.currentOutstanding)
          : 0,
        totalOutstanding: financialAccess
          ? safeNumber(item._sum.currentOutstanding)
          : 0,
      })),
      cycleSummary: {
        totalCycles: cycleAgg._count,
        totalCycleOutstanding: financialAccess ? safeNumber(cycleAgg._sum.outstandingAmount) : 0,
        totalCycleAmount: financialAccess ? safeNumber(cycleAgg._sum.amount) : 0,
        totalCyclePaid: financialAccess ? safeNumber(cycleAgg._sum.paidAmount) : 0,
      },
    }

    return successResponse(data)
  } catch (error) {
    console.error('Error fetching recurring bills summary:', error)
    return errorResponse('Failed to fetch recurring bills summary', 500)
  }
}
