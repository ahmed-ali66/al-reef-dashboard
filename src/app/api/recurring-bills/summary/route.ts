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
// Supports ?month=6&year=2026 for monthly context filtering
// When month/year provided, overdue/upcoming metrics reflect that context
// Total Outstanding always uses bill.currentOutstanding (single source of truth)
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const financialAccess = isFinancialUser(user.role)
    const now = new Date()

    const { searchParams } = new URL(request.url)
    const targetMonth = parseInt(searchParams.get('month') || String(now.getMonth() + 1))
    const targetYear = parseInt(searchParams.get('year') || String(now.getFullYear()))

    const monthStart = new Date(targetYear, targetMonth - 1, 1)
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999)

    const isCurrentMonth =
      targetMonth === now.getMonth() + 1 &&
      targetYear === now.getFullYear()

    const baseWhere = {
      companyId: user.companyId,
      deletedAt: null,
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const overdueDateThreshold = isCurrentMonth ? startOfToday : monthEnd

    // FIX: Use bill.currentOutstanding as the single source of truth for totalOutstanding.
    // Previously used cycle.outstandingAmount which only counted cycles due in the selected month,
    // producing a different number than the dashboard UI and PDF/XLSX exports.
    // Now: totalOutstanding = sum of bill.currentOutstanding for all active bills with cycles in the month.

    const [
      activeBills,
      outstandingAgg,
      overdueAmountAgg,
      paidThisMonthAgg,
      upcomingBills,
      overdueBillIds,
      serviceTypeBreakdownBills,
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

      // FIX: totalOutstanding = sum of bill.currentOutstanding for active bills
      // that have cycles in the selected month. This matches the dashboard and exports.
      prisma.recurringBill.aggregate({
        where: {
          ...baseWhere,
          status: 'active',
          currentOutstanding: { gt: 0 },
          cycles: {
            some: {
              dueDate: { gte: monthStart, lte: monthEnd },
            },
          },
        },
        _sum: { currentOutstanding: true },
      }),

      // totalOverdueAmount: active bills where nextDueDate < threshold AND currentOutstanding > 0
      prisma.recurringBill.aggregate({
        where: {
          ...baseWhere,
          status: 'active',
          nextDueDate: { lt: overdueDateThreshold },
          currentOutstanding: { gt: 0 },
        },
        _sum: { currentOutstanding: true },
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

      // upcomingBills: next 5 bills with nextDueDate in the future AND outstanding > 0
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          nextDueDate: { gte: startOfToday },
          currentOutstanding: { gt: 0 },
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

      // overdueBillIds: active bills where nextDueDate < threshold AND outstanding > 0
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          nextDueDate: { lt: overdueDateThreshold },
          currentOutstanding: { gt: 0 },
        },
        select: { id: true },
        distinct: ['id'],
      }),

      // FIX: Service type breakdown using bill.currentOutstanding (not cycle.outstandingAmount)
      prisma.recurringBill.findMany({
        where: {
          ...baseWhere,
          status: 'active',
          currentOutstanding: { gt: 0 },
          cycles: {
            some: {
              dueDate: { gte: monthStart, lte: monthEnd },
            },
          },
        },
        select: {
          id: true,
          serviceType: true,
          currentOutstanding: true,
        },
      }),

      // Cycle-level aggregation for the selected month (informational only)
      prisma.billCycle.aggregate({
        where: {
          companyId: user.companyId,
          dueDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { status: 'active', deletedAt: null },
          status: { in: ['pending', 'partially_paid', 'overdue'] },
        },
        _sum: { outstandingAmount: true, amount: true, paidAmount: true },
        _count: true,
      }),
    ])

    // ── Build service type breakdown from bill-level data ──
    const serviceTypeMap = new Map<string, { count: number; outstanding: number }>()
    for (const bill of serviceTypeBreakdownBills) {
      const st = bill.serviceType || 'custom'
      const existing = serviceTypeMap.get(st) || { count: 0, outstanding: 0 }
      existing.count += 1
      existing.outstanding += parseFloat(String(bill.currentOutstanding))
      serviceTypeMap.set(st, existing)
    }

    // ── Build overdue bills list from overdueBillIds ──
    const overdueBillIdList = overdueBillIds.map((item) => item.id)
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

    // Build response — totalOutstanding uses bill.currentOutstanding (single source of truth)
    const data = {
      selectedMonth: targetMonth,
      selectedYear: targetYear,
      isCurrentMonth,
      totalBills: activeBills,
      totalOutstanding: financialAccess
        ? safeNumber(outstandingAgg._sum.currentOutstanding)
        : 0,
      totalPaidThisMonth: financialAccess
        ? safeNumber(paidThisMonthAgg._sum.amount)
        : 0,
      overdueCount: overdueBillIds.length,
      totalOverdueAmount: financialAccess
        ? safeNumber(overdueAmountAgg._sum.currentOutstanding)
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
