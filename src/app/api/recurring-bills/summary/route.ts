import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
  safeDecimal,
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
      overdueAmountAgg,
      paidThisMonthAgg,
      upcomingBills,
      overdueBillIds,
      serviceTypeBreakdown,
      cycleAgg,
    ] = await Promise.all([
      // totalBills: count of active bills
      prisma.recurringBill.count({
        where: { ...baseWhere, status: 'active' },
      }),

      // totalOutstanding: sum of cycle outstandingAmount across open cycles of active bills
      // This replaces the old bill-level currentOutstanding aggregate to ensure
      // consistency with the cycle-based "Due" metric and to avoid inflated values
      // from bills where currentOutstanding was corrupted by prior bugs
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { outstandingAmount: true },
      }),

      // totalDueThisMonth: sum of open cycle amounts due this month
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { outstandingAmount: true },
      }),

      // totalOverdueAmount: sum of cycle outstandingAmount for overdue cycles (dueDate < now)
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { lt: now },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { outstandingAmount: true },
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

      // upcomingBills: next 5 bills by EARLIEST open cycle due date
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          cycles: {
            some: {
              status: { in: ['pending', 'partially_paid', 'overdue'] },
              dueDate: { gte: now },
            },
          },
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
          cycles: {
            where: { status: { in: ['pending', 'partially_paid', 'overdue'] } },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { nextDueDate: 'asc' },
        take: 5,
      }),

      // overdueBillIds: distinct bill IDs that have open cycles with dueDate < now
      // FIX: Uses cycle-level dueDate instead of bill-level nextDueDate
      prisma.billCycle.findMany({
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { lt: now },
          recurringBill: { status: 'active', deletedAt: null },
        },
        select: { recurringBillId: true },
        distinct: ['recurringBillId'],
      }),

      // Group by serviceType for breakdown using cycle outstanding amounts
      prisma.billCycle.groupBy({
        by: ['recurringBillId'],
        where: {
          companyId: user.companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { outstandingAmount: true },
      }),

      // Cycle-level aggregation (all open cycles, exclude deleted bills)
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

    // ── Build service type breakdown from cycle data ──
    // We grouped cycles by recurringBillId; now look up each bill's serviceType
    const billIdsForBreakdown = serviceTypeBreakdown.map((item) => item.recurringBillId)
    const billsForBreakdown = await prisma.recurringBill.findMany({
      where: { id: { in: billIdsForBreakdown } },
      select: { id: true, serviceType: true },
    })
    const billServiceTypeMap = new Map(billsForBreakdown.map((b) => [b.id, b.serviceType]))

    // Aggregate by serviceType
    const serviceTypeMap = new Map<string, { count: number; outstanding: number }>()
    for (const item of serviceTypeBreakdown) {
      const st = billServiceTypeMap.get(item.recurringBillId) || 'custom'
      const existing = serviceTypeMap.get(st) || { count: 0, outstanding: 0 }
      existing.count += 1
      existing.outstanding += safeNumber(item._sum.outstandingAmount)
      serviceTypeMap.set(st, existing)
    }

    // ── Build overdue bills list from overdueBillIds ──
    // FIX: Fetches bills that have overdue CYCLES (dueDate < now), not just
    // bills where nextDueDate < now. This correctly identifies bills whose
    // current billing cycle is past due even if nextDueDate points to the next cycle.
    const overdueBillIdList = overdueBillIds.map((item) => item.recurringBillId)
    const overdueBillsList = overdueBillIdList.length > 0
      ? await prisma.recurringBill.findMany({
          where: { id: { in: overdueBillIdList }, ...baseWhere, status: 'active' },
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
            cycles: {
              where: {
                status: { in: ['pending', 'partially_paid', 'overdue'] },
                dueDate: { lt: now },
              },
              orderBy: { dueDate: 'asc' },
              take: 1,
            },
          },
          orderBy: { nextDueDate: 'asc' },
        })
      : []

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

    // Build response — all metrics are now cycle-based for consistency
    const data = {
      totalBills: activeBills,
      // FIX: Total Outstanding is now the sum of all open cycle outstandingAmounts
      // Previously used bill.currentOutstanding which could be inflated/corrupted
      totalOutstanding: financialAccess
        ? safeNumber(outstandingAgg._sum.outstandingAmount)
        : 0,
      // FIX: Total Due This Month is the sum of open cycle outstandingAmounts
      // for cycles due this month (was using cycle.amount which ignored partial payments)
      totalDueThisMonth: financialAccess
        ? safeNumber(dueThisMonthAgg._sum.outstandingAmount)
        : 0,
      totalPaidThisMonth: financialAccess
        ? safeNumber(paidThisMonthAgg._sum.amount)
        : 0,
      // FIX: Overdue count now based on cycle-level dueDate, not bill.nextDueDate
      overdueCount: overdueBillIds.length,
      totalOverdueAmount: financialAccess
        ? safeNumber(overdueAmountAgg._sum.outstandingAmount)
        : 0,
      upcomingBills: upcomingBills.map((bill) => financialMask(bill, amountFields)),
      overdueBills: overdueBillsList.map((bill) => financialMask(bill, amountFields)),
      serviceTypeBreakdown: Array.from(serviceTypeMap.entries()).map(
        ([serviceType, data]) => ({
          serviceType,
          count: data.count,
          totalOutstanding: financialAccess ? data.outstanding : 0,
          totalAmountDue: financialAccess ? data.outstanding : 0,
        })
      ),
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
