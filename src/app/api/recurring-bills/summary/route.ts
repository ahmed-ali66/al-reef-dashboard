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
// Supports ?month=6&year=2026 for monthly context filtering
// When month/year provided, all metrics reflect that month only
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // All authenticated users can view summary
    const financialAccess = isFinancialUser(user.role)
    const now = new Date()

    // Parse month/year from query params (default: current month)
    const { searchParams } = new URL(request.url)
    const targetMonth = parseInt(searchParams.get('month') || String(now.getMonth() + 1))
    const targetYear = parseInt(searchParams.get('year') || String(now.getFullYear()))

    // Compute month boundaries for the selected month
    // Using UTC-based dates to avoid timezone issues with Prisma
    const monthStart = new Date(targetYear, targetMonth - 1, 1)
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999)

    // Is this the current month?
    const isCurrentMonth =
      targetMonth === now.getMonth() + 1 &&
      targetYear === now.getFullYear()

    const baseWhere = {
      companyId: user.companyId,
      deletedAt: null,
    }

    // ── For "Due This Month" and "Overdue" calculations:
    // Cycles due in the selected month (regardless of their status)
    const cycleDueThisMonth = {
      companyId: user.companyId,
      dueDate: { gte: monthStart, lte: monthEnd },
      recurringBill: { status: 'active', deletedAt: null },
    }

    // Open cycles = pending/partially_paid/overdue
    const openCycleStatuses = ['pending', 'partially_paid', 'overdue']

    // Overdue cycles: dueDate < start of selected month AND still open
    // (For historical months, everything due that month that wasn't paid is overdue)
    // For current month, overdue = dueDate < today AND still open
    // FIX: Use start-of-day for "Overdue ONLY IF: currentDate > dueDate"
    // (bills due today are NOT overdue — they become overdue tomorrow)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const overdueDateThreshold = isCurrentMonth ? startOfToday : monthEnd

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
      // totalBills: count of active bills that have at least one cycle in the selected month
      prisma.recurringBill.count({
        where: {
          ...baseWhere,
          status: 'active',
          cycles: {
            some: {
              dueDate: { gte: monthStart, lte: monthEnd },
            },
          },
        },
      }),

      // totalOutstanding: sum of open cycle outstandingAmount for cycles due in selected month
      prisma.billCycle.aggregate({
        where: {
          ...cycleDueThisMonth,
          status: { in: openCycleStatuses },
        },
        _sum: { outstandingAmount: true },
      }),

      // totalDueThisMonth: sum of full cycle amounts (not outstanding) for open cycles
      // due in the selected month. This is the gross bill obligation, not the net remaining.
      prisma.billCycle.aggregate({
        where: {
          ...cycleDueThisMonth,
          status: { in: openCycleStatuses },
        },
        _sum: { amount: true },
      }),

      // totalOverdueAmount: open cycles due BEFORE the threshold (now for current month,
      // end-of-month for historical months) — these are the truly overdue ones
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          status: { in: openCycleStatuses },
          dueDate: { lt: overdueDateThreshold },
          recurringBill: { status: 'active', deletedAt: null },
        },
        _sum: { outstandingAmount: true },
      }),

      // totalPaidThisMonth: sum of BillPayment amounts in the selected month
      prisma.billPayment.aggregate({
        where: {
          companyId: user.companyId,
          paymentDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { deletedAt: null },
        },
        _sum: { amount: true },
      }),

      // upcomingBills: next 5 bills with open cycles due AFTER now (only meaningful for current month)
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          cycles: {
            some: {
              status: { in: openCycleStatuses },
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
            where: { status: { in: openCycleStatuses } },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { nextDueDate: 'asc' },
        take: 5,
      }),

      // overdueBillIds: distinct bill IDs that have open cycles past due
      prisma.billCycle.findMany({
        where: {
          companyId: user.companyId,
          status: { in: openCycleStatuses },
          dueDate: { lt: overdueDateThreshold },
          recurringBill: { status: 'active', deletedAt: null },
        },
        select: { recurringBillId: true },
        distinct: ['recurringBillId'],
      }),

      // Group by recurringBillId for service type breakdown
      prisma.billCycle.groupBy({
        by: ['recurringBillId'],
        where: {
          ...cycleDueThisMonth,
          status: { in: openCycleStatuses },
        },
        _sum: { outstandingAmount: true },
      }),

      // Cycle-level aggregation for the selected month
      prisma.billCycle.aggregate({
        where: {
          ...cycleDueThisMonth,
          status: { in: openCycleStatuses },
        },
        _sum: { outstandingAmount: true, amount: true, paidAmount: true },
        _count: true,
      }),
    ])

    // ── Build service type breakdown from cycle data ──
    const billIdsForBreakdown = serviceTypeBreakdown.map((item) => item.recurringBillId)
    const billsForBreakdown = billIdsForBreakdown.length > 0
      ? await prisma.recurringBill.findMany({
          where: { id: { in: billIdsForBreakdown } },
          select: { id: true, serviceType: true },
        })
      : []
    const billServiceTypeMap = new Map(billsForBreakdown.map((b) => [b.id, b.serviceType]))

    const serviceTypeMap = new Map<string, { count: number; outstanding: number }>()
    for (const item of serviceTypeBreakdown) {
      const st = billServiceTypeMap.get(item.recurringBillId) || 'custom'
      const existing = serviceTypeMap.get(st) || { count: 0, outstanding: 0 }
      existing.count += 1
      existing.outstanding += safeNumber(item._sum.outstandingAmount)
      serviceTypeMap.set(st, existing)
    }

    // ── Build overdue bills list from overdueBillIds ──
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
                status: { in: openCycleStatuses },
                dueDate: { lt: overdueDateThreshold },
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

    // Build response — all metrics scoped to the selected month
    const data = {
      // Return the selected month context so the frontend knows what's being viewed
      selectedMonth: targetMonth,
      selectedYear: targetYear,
      isCurrentMonth,
      totalBills: activeBills,
      totalOutstanding: financialAccess
        ? safeNumber(outstandingAgg._sum.outstandingAmount)
        : 0,
      totalDueThisMonth: financialAccess
        ? safeNumber(dueThisMonthAgg._sum.amount)
        : 0,
      totalPaidThisMonth: financialAccess
        ? safeNumber(paidThisMonthAgg._sum.amount)
        : 0,
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
