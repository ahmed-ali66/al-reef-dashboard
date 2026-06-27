import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  unauthorizedResponse,
  isFinancialUser,
  errorResponse,
  successResponse,
  safeNumber,
} from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'

// GET /api/dashboard — aggregated dashboard data for the authenticated user's company
// PERFORMANCE OPTIMIZED: All independent DB queries run in parallel via 2 big Promise.all blocks.
// Previous: 10+ sequential awaits → ~4.6s response time
// Optimized: 2 Promise.all blocks → target ~1.5s response time
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const companyId = user.companyId
    const financialAccess = isFinancialUser(user.role)

    // Get current month/year
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // Date ranges (computed once, reused)
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

    // Chart months (last 6 months)
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    const chartMonths: Array<{ month: number; year: number }> = []
    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i
      let y = currentYear
      if (m <= 0) {
        m += 12
        y -= 1
      }
      chartMonths.push({ month: m, year: y })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BLOCK A: All independent aggregates, counts, and single-row queries
    // These don't depend on each other → run all in parallel
    // ═══════════════════════════════════════════════════════════════════════
    const [
      company,
      totalTenantsCount,
      activeTenantsCount,
      totalPropertiesCount,
      totalUnitsAggregate,
      currentMonthPaidAggregate,
      expectedRevenueAggregate,
      currentMonthAdjustmentsAggregate,
      currentMonthExpensesAggregate,
      paymentByMonth,
      activeBillsCount,
      billsOutstandingAggregate,
      billsDueThisMonthAggregate,
      billsPaidThisMonthAggregate,
      overdueBillsCount,
      pendingReservationsCount,
      confirmedReservationsCount,
      convertedReservationsCount,
      cancelledReservationsCount,
      totalDepositsCollectedAggregate,
      upcomingMoveInsCount,
    ] = await Promise.all([
      // Company info
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true, name: true, nameAr: true, nameBn: true, nameUr: true,
          phone: true, email: true, address: true,
        },
      }),

      // Total non-deleted tenants
      prisma.tenant.count({ where: { companyId, deletedAt: null } }),

      // Financially active tenants count (active + notice period)
      prisma.tenant.count({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
      }),

      // Non-deleted properties count
      prisma.property.count({ where: { companyId, deletedAt: null } }),

      // Total units across all properties
      prisma.property.aggregate({
        where: { companyId, deletedAt: null },
        _sum: { totalUnits: true },
      }),

      // Current month collected revenue
      prisma.payment.aggregate({
        where: { companyId, month: currentMonth, year: currentYear },
        _sum: { amount: true },
      }),

      // Expected revenue = sum of rentAmount for financially active tenants
      prisma.tenant.aggregate({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
        _sum: { rentAmount: true },
      }),

      // Current month adjustments
      prisma.rentAdjustment.aggregate({
        where: { companyId, status: 'approved', effectiveMonth: currentMonth, effectiveYear: currentYear },
        _sum: { amount: true },
      }),

      // Current month expenses
      prisma.expense.aggregate({
        where: { companyId, deletedAt: null, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),

      // Chart data: payments by month (last 6 months)
      prisma.payment.groupBy({
        by: ['month', 'year'],
        where: {
          companyId,
          month: { in: chartMonths.map((c) => c.month) },
          year: { in: chartMonths.map((c) => c.year) },
        },
        _sum: { amount: true },
      }),

      // Recurring bills stats
      prisma.recurringBill.count({ where: { companyId, deletedAt: null, status: 'active' } }),
      prisma.recurringBill.aggregate({
        where: { companyId, deletedAt: null, status: 'active' },
        _sum: { currentOutstanding: true },
      }),
      prisma.billCycle.aggregate({
        where: {
          companyId,
          status: { in: ['pending', 'partially_paid', 'overdue'] },
          dueDate: { gte: startOfMonth, lte: endOfMonth },
          recurringBill: { deletedAt: null, status: 'active' },
        },
        _sum: { amount: true },
      }),
      prisma.billPayment.aggregate({
        where: {
          companyId,
          paymentDate: { gte: startOfMonth, lte: endOfMonth },
          recurringBill: { deletedAt: null },
        },
        _sum: { amount: true },
      }),
      prisma.recurringBill.count({
        where: { companyId, deletedAt: null, status: 'active', nextDueDate: { lt: now } },
      }),

      // Reservation stats
      prisma.reservation.count({ where: { companyId, deletedAt: null, status: 'pending' } }),
      prisma.reservation.count({ where: { companyId, deletedAt: null, status: 'confirmed' } }),
      prisma.reservation.count({ where: { companyId, deletedAt: null, status: 'converted' } }),
      prisma.reservation.count({ where: { companyId, deletedAt: null, status: 'cancelled' } }),
      prisma.reservation.aggregate({
        where: { companyId, deletedAt: null, depositStatus: 'paid' },
        _sum: { depositAmount: true },
      }),
      prisma.reservation.count({
        where: {
          companyId, deletedAt: null, status: 'confirmed',
          expectedMoveInDate: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ])

    // ─── Derive values from Block A results ───
    const expectedRevenue = safeNumber(expectedRevenueAggregate._sum.rentAmount)
    const collectedRevenue = safeNumber(currentMonthPaidAggregate._sum.amount)
    const totalUnits = safeNumber(totalUnitsAggregate._sum.totalUnits)
    const occupiedUnits = activeTenantsCount  // same as activeTenantsCount
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
    const totalAdjustments = safeNumber(currentMonthAdjustmentsAggregate._sum.amount)
    const totalExpenses = safeNumber(currentMonthExpensesAggregate._sum.amount)
    const netProfit = collectedRevenue - totalExpenses
    const utilityBillsOutstanding = safeNumber(billsOutstandingAggregate._sum.currentOutstanding)
    const utilityBillsDueThisMonth = safeNumber(billsDueThisMonthAggregate._sum.amount)
    const utilityBillsPaidThisMonth = safeNumber(billsPaidThisMonthAggregate._sum.amount)

    // Build payment-by-month lookup map
    const paymentByMonthMap = new Map<string, number>()
    for (const row of paymentByMonth) {
      const key = `${row.month}-${row.year}`
      paymentByMonthMap.set(key, safeNumber(row._sum.amount))
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BLOCK B: findMany queries (need activeTenants for chart data computation,
    // and paidTenantIds for overdue calc — but these don't depend on each other)
    // ═══════════════════════════════════════════════════════════════════════
    const [
      paidTenantIdsResult,
      activeTenants,
      recentPayments,
      properties,
      maintenanceItems,
      expensesThisMonth,
    ] = await Promise.all([
      // Tenants who paid this month (for overdue calc)
      prisma.payment.findMany({
        where: {
          companyId,
          month: currentMonth,
          year: currentYear,
          allocationType: { not: 'HISTORICAL_DEBT' },
        },
        select: { tenantId: true, amount: true },
      }),

      // Financially active tenants (needed for overdue calc + chart data)
      prisma.tenant.findMany({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
        select: {
          id: true, name: true, nameAr: true, nameBn: true, nameUr: true,
          phone: true, unitNumber: true, rentAmount: true, openingBalance: true,
          creditBalance: true, municipalityFee: true, securityDeposit: true, newRent: true,
          propertyId: true, status: true, latePaymentCount: true, tenantScore: true,
          systemScore: true, manualScoreOverride: true, leaseStart: true, leaseEnd: true,
          property: { select: { id: true, name: true } },
        },
      }),

      // Recent payments (top 10)
      prisma.payment.findMany({
        where: { companyId },
        include: {
          tenant: {
            select: { id: true, name: true, unitNumber: true, phone: true, rentAmount: true, propertyId: true },
          },
        },
        orderBy: { date: 'desc' },
        take: 10,
      }),

      // Properties with tenant counts
      prisma.property.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true, name: true, nameAr: true, nameBn: true, nameUr: true,
          type: true, address: true, totalUnits: true, floors: true,
          archived: true, createdAt: true, updatedAt: true,
          tenants: { where: { deletedAt: null }, select: { id: true, status: true } },
        },
      }),

      // Maintenance items (recent/active, bounded to 50)
      prisma.maintenance.findMany({
        where: { companyId, deletedAt: null, status: { not: 'completed' } },
        include: { property: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // Expenses this month (bounded to 50)
      prisma.expense.findMany({
        where: { companyId, deletedAt: null, date: { gte: startOfMonth, lte: endOfMonth } },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ])

    // ─── Compute overdue/partial tenants (needs activeTenants + paidTenantIds) ───
    const paidMap = new Map<string, number>()
    for (const p of paidTenantIdsResult) {
      paidMap.set(p.tenantId, (paidMap.get(p.tenantId) || 0) + Number(p.amount))
    }

    const overdueTenants = activeTenants.filter((t) => !paidMap.has(t.id))
    const partialTenants = activeTenants.filter((t) => {
      const totalPaid = paidMap.get(t.id) || 0
      return totalPaid > 0 && totalPaid < Number(t.rentAmount)
    })

    const overdueAmount =
      overdueTenants.reduce((sum, t) => {
        const ob = Number(t.openingBalance) || 0
        const cb = Number(t.creditBalance) || 0
        return sum + Math.max(0, ob + Number(t.rentAmount) - cb)
      }, 0) +
      partialTenants.reduce((sum, t) => {
        const paid = paidMap.get(t.id) || 0
        const ob = Number(t.openingBalance) || 0
        const cb = Number(t.creditBalance) || 0
        return sum + Math.max(0, ob + Number(t.rentAmount) - cb - paid)
      }, 0)

    // ─── Chart data (needs activeTenants for lease-aware expected) ───
    const chartData = chartMonths.map(({ month, year }) => {
      const monthStart = new Date(year, month - 1, 1)
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
      let monthExpected = 0
      for (const t of activeTenants) {
        const leaseStart = t.leaseStart ? new Date(t.leaseStart) : null
        const leaseEnd = t.leaseEnd ? new Date(t.leaseEnd) : null
        if (leaseStart && leaseStart > monthEnd) continue
        if (leaseEnd && leaseEnd < monthStart) continue
        monthExpected += safeNumber(t.rentAmount)
      }
      return {
        month: monthNames[month - 1],
        expected: monthExpected,
        collected: paymentByMonthMap.get(`${month}-${year}`) || 0,
      }
    })

    // ─── Per-tenant payment status ───
    const dayOfMonth = now.getDate()
    const activeTenantsWithStatus = activeTenants.map((t) => {
      const totalPaid = paidMap.get(t.id) || 0
      let paymentStatus: 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon' = 'overdue'
      if (totalPaid >= Number(t.rentAmount)) {
        paymentStatus = 'paid'
      } else if (totalPaid > 0) {
        paymentStatus = 'partial'
      } else {
        if (dayOfMonth <= 2) paymentStatus = 'due-soon'
        else if (dayOfMonth <= 4) paymentStatus = 'unpaid'
        else paymentStatus = 'overdue'
      }
      return { ...t, paymentStatus, totalPaid: financialAccess ? totalPaid : 0 }
    })

    const dueSoon = dayOfMonth <= 5 ? overdueTenants : []

    // ─── Properties with counts ───
    const propertiesWithCounts = properties
      .map((p) => {
        const { tenants, ...propertyData } = p
        return {
          ...propertyData,
          tenantCount: tenants.length,
          activeTenantCount: tenants.filter((t) => FINANCIALLY_ACTIVE_STATUSES.includes(t.status as any)).length,
        }
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    // ─── Build response ───
    const financialMask = (obj: any, fields: string[]) => {
      if (financialAccess) return serialize(obj)
      const masked = { ...serialize(obj) }
      for (const f of fields) {
        if (f in masked) masked[f] = 0
      }
      return masked
    }

    const data = {
      company,
      stats: {
        expectedRevenue: financialAccess ? expectedRevenue : 0,
        collectedRevenue: financialAccess ? collectedRevenue : 0,
        totalAdjustments: financialAccess ? totalAdjustments : 0,
        overdueCount: overdueTenants.length,
        overdueAmount: financialAccess ? overdueAmount : 0,
        activeTenants: activeTenantsCount,
        totalTenants: totalTenantsCount,
        occupancyRate,
        totalUnits,
        occupiedUnits,
        partialCount: partialTenants.length,
        netProfit: financialAccess ? netProfit : 0,
        totalExpenses: financialAccess ? totalExpenses : 0,
      },
      overdueTenants: overdueTenants.map((t) =>
        financialMask(t, ['rentAmount', 'municipalityFee', 'securityDeposit', 'newRent'])
      ),
      partialTenants: partialTenants.map((t) =>
        financialMask(t, ['rentAmount', 'municipalityFee', 'securityDeposit', 'newRent'])
      ),
      dueSoon: dueSoon.map((t) =>
        financialMask(t, ['rentAmount', 'municipalityFee', 'securityDeposit', 'newRent'])
      ),
      activeTenantsList: activeTenantsWithStatus.map((t) =>
        financialMask(t, ['rentAmount', 'municipalityFee', 'securityDeposit', 'newRent', 'totalPaid'])
      ),
      recentPayments: financialAccess
        ? recentPayments.map((p) => serialize(p))
        : recentPayments.map(({ amount, ...rest }) => ({ ...serialize(rest), amount: 0 })),
      chartData: financialAccess
        ? chartData
        : chartData.map((d) => ({ month: d.month, expected: 0, collected: 0 })),
      properties: propertiesWithCounts.map((p) => serialize(p)),
      expenses: financialAccess
        ? expensesThisMonth.map((e) => serialize(e))
        : expensesThisMonth.map(({ amount, ...rest }) => ({ ...serialize(rest), amount: 0 })),
      maintenanceItems: maintenanceItems.map((m) => serialize(m)),
      reservationStats: {
        pendingCount: pendingReservationsCount,
        confirmedCount: confirmedReservationsCount,
        convertedCount: convertedReservationsCount,
        cancelledCount: cancelledReservationsCount,
        totalDepositsCollected: financialAccess ? safeNumber(totalDepositsCollectedAggregate._sum.depositAmount) : 0,
        upcomingMoveIns: upcomingMoveInsCount,
      },
      recurringBills: {
        totalBills: activeBillsCount,
        totalOutstanding: financialAccess ? utilityBillsOutstanding : 0,
        totalDueThisMonth: financialAccess ? utilityBillsDueThisMonth : 0,
        totalPaidThisMonth: financialAccess ? utilityBillsPaidThisMonth : 0,
        overdueBills: overdueBillsCount,
      },
    }

    return successResponse(data)
  } catch (error) {
    console.error('Dashboard error:', error)
    return errorResponse('Failed to fetch dashboard data', 500)
  }
}
