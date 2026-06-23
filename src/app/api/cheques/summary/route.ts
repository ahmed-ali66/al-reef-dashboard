import prisma from '@/lib/db'
import {
  getAuthUser,
  unauthorizedResponse,
  errorResponse,
  successResponse,
  safeNumber,
} from '@/lib/api-utils'

// GET /api/cheques/summary — dashboard summary cards
// Returns:
//   - totalPending: sum of all pending cheques + count
//   - upcoming30: sum + count of pending cheques due in next 30 days
//   - overdue: sum + count of pending cheques past due date
//   - paidThisYear: sum + count of cheques paid in current calendar year
//   - byProperty: breakdown of pending amounts per property
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thirtyDaysLater = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)

    // Run all aggregations in parallel
    const [
      totalPendingAgg,
      upcoming30Agg,
      overdueAgg,
      paidThisYearAgg,
      byPropertyPending,
    ] = await Promise.all([
      // Total pending (all pending cheques)
      prisma.cheque.aggregate({
        where: { companyId: user.companyId, status: 'pending', deletedAt: null },
        _sum: { amount: true },
        _count: true,
      }),

      // Upcoming 30 days: pending + dueDate in [today, today+30]
      prisma.cheque.aggregate({
        where: {
          companyId: user.companyId,
          status: 'pending',
          deletedAt: null,
          dueDate: { gte: startOfToday, lte: thirtyDaysLater },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Overdue: pending + dueDate < today
      prisma.cheque.aggregate({
        where: {
          companyId: user.companyId,
          status: 'pending',
          deletedAt: null,
          dueDate: { lt: startOfToday },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Paid this year: paidDate within current calendar year
      prisma.cheque.aggregate({
        where: {
          companyId: user.companyId,
          status: 'paid',
          deletedAt: null,
          paidDate: { gte: yearStart, lte: yearEnd },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // By property: pending amounts grouped by property
      prisma.cheque.findMany({
        where: { companyId: user.companyId, status: 'pending', deletedAt: null },
        select: {
          amount: true,
          propertyId: true,
          property: { select: { id: true, name: true } },
        },
      }),
    ])

    // Group by property manually (Prisma doesn't support groupBy with relations easily)
    const byPropertyMap = new Map<string, { propertyId: string; propertyName: string; totalPending: number; chequeCount: number }>()
    for (const c of byPropertyPending) {
      const pid = c.propertyId
      const existing = byPropertyMap.get(pid) || { propertyId: pid, propertyName: c.property?.name || 'Unknown', totalPending: 0, chequeCount: 0 }
      existing.totalPending += safeNumber(c.amount)
      existing.chequeCount += 1
      byPropertyMap.set(pid, existing)
    }
    const byProperty = Array.from(byPropertyMap.values()).sort((a, b) => b.totalPending - a.totalPending)

    return successResponse({
      totalPending: {
        amount: safeNumber(totalPendingAgg._sum.amount),
        count: totalPendingAgg._count,
      },
      upcoming30: {
        amount: safeNumber(upcoming30Agg._sum.amount),
        count: upcoming30Agg._count,
      },
      overdue: {
        amount: safeNumber(overdueAgg._sum.amount),
        count: overdueAgg._count,
      },
      paidThisYear: {
        amount: safeNumber(paidThisYearAgg._sum.amount),
        count: paidThisYearAgg._count,
      },
      byProperty,
      asOfDate: now.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching cheque summary:', error)
    return errorResponse('Failed to fetch cheque summary', 500)
  }
}
