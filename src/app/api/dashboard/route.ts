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
// PHASE 1 FIX: Uses Prisma aggregate(), groupBy(), count() — NO full-table data loading
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

    // ─── 1. Company info (single row, no scan) ───
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        nameAr: true,
        nameBn: true,
        nameUr: true,
        phone: true,
        email: true,
        address: true,
      },
    })

    // ─── 2. Stats via count() and aggregate() — no row fetching ───
    const [
      totalTenantsCount,
      activeTenantsCount,
      totalPropertiesCount,
      totalUnitsAggregate,
      occupiedUnitsAggregate,
      currentMonthPaidAggregate,
      expectedRevenueAggregate,
    ] = await Promise.all([
      // Total non-deleted tenants
      prisma.tenant.count({
        where: { companyId, deletedAt: null },
      }),

      // Financially active tenants count (active + notice period)
      prisma.tenant.count({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
      }),

      // Non-deleted properties count
      prisma.property.count({
        where: { companyId, deletedAt: null },
      }),

      // Total units across all properties
      prisma.property.aggregate({
        where: { companyId, deletedAt: null },
        _sum: { totalUnits: true },
      }),

      // Occupied units = financially active tenants count
      prisma.tenant.count({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
      }),

      // Current month collected revenue via aggregate
      prisma.payment.aggregate({
        where: {
          companyId,
          month: currentMonth,
          year: currentYear,
        },
        _sum: { amount: true },
      }),

      // Expected revenue = sum of rentAmount for financially active tenants
      prisma.tenant.aggregate({
        where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
        _sum: { rentAmount: true },
      }),
    ])

    const expectedRevenue = safeNumber(expectedRevenueAggregate._sum.rentAmount)
    const collectedRevenue = safeNumber(currentMonthPaidAggregate._sum.amount)
    const totalUnits = safeNumber(totalUnitsAggregate._sum.totalUnits)
    const occupiedUnits = occupiedUnitsAggregate
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

    // ─── Current month adjustments total ───
    const currentMonthAdjustmentsAggregate = await prisma.rentAdjustment.aggregate({
      where: {
        companyId,
        status: 'approved',
        effectiveMonth: currentMonth,
        effectiveYear: currentYear,
      },
      _sum: { amount: true },
    })
    const totalAdjustments = safeNumber(currentMonthAdjustmentsAggregate._sum.amount)

    // ─── 3. Current month expenses — aggregate only (FIX: filter for current month) ───
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

    const currentMonthExpensesAggregate = await prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    })
    const totalExpenses = safeNumber(currentMonthExpensesAggregate._sum.amount)
    const netProfit = collectedRevenue - totalExpenses

    // ─── 4. Overdue & partial tenants — lightweight query (IDs + rent only) ───
    // Find tenants who have paid this month (just tenantId)
    // CRITICAL: Exclude HISTORICAL_DEBT payments — they're already reflected in the
    // reduced tenant.openingBalance. Including them would double-count the payment
    // (once via reduced openingBalance, once via paymentsReceived).
    const paidTenantIds = await prisma.payment.findMany({
      where: {
        companyId,
        month: currentMonth,
        year: currentYear,
        allocationType: { not: 'HISTORICAL_DEBT' },
      },
      select: { tenantId: true, amount: true },
    })

    // Build a map of tenantId -> total paid this month (excluding HISTORICAL_DEBT)
    const paidMap = new Map<string, number>()
    for (const p of paidTenantIds) {
      paidMap.set(p.tenantId, (paidMap.get(p.tenantId) || 0) + Number(p.amount))
    }

    // Financially active tenants (lightweight — only fields needed for overdue calc)
    const activeTenants = await prisma.tenant.findMany({
      where: { companyId, deletedAt: null, status: { in: [...FINANCIALLY_ACTIVE_STATUSES] } },
      select: {
        id: true,
        name: true,
        nameAr: true,
        nameBn: true,
        nameUr: true,
        phone: true,
        unitNumber: true,
        rentAmount: true,
        openingBalance: true,
        creditBalance: true,
        municipalityFee: true,
        securityDeposit: true,
        newRent: true,
        propertyId: true,
        status: true,
        latePaymentCount: true,
        tenantScore: true,
        systemScore: true,
        manualScoreOverride: true,
        property: {
          select: { id: true, name: true },
        },
      },
    })

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

    // ─── 5. Chart data — last 6 months via groupBy (NO full-table scan) ───
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

    // Use groupBy to get collected revenue per month
    const paymentByMonth = await prisma.payment.groupBy({
      by: ['month', 'year'],
      where: {
        companyId,
        month: { in: chartMonths.map((c) => c.month) },
        year: { in: chartMonths.map((c) => c.year) },
      },
      _sum: { amount: true },
    })

    // Build lookup map from groupBy result
    const paymentByMonthMap = new Map<string, number>()
    for (const row of paymentByMonth) {
      const key = `${row.month}-${row.year}`
      paymentByMonthMap.set(key, safeNumber(row._sum.amount))
    }

    const chartData = chartMonths.map(({ month, year }) => ({
      month: monthNames[month - 1],
      expected: expectedRevenue,
      collected: paymentByMonthMap.get(`${month}-${year}`) || 0,
    }))

    // ─── 6. Recent payments — top 10 only (bounded) ───
    const recentPayments = await prisma.payment.findMany({
      where: { companyId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            unitNumber: true,
            phone: true,
            rentAmount: true,
            propertyId: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 10,
    })

    // ─── 7. Per-tenant payment status (for Payment Status Board) ───
    const dayOfMonth = now.getDate()
    const activeTenantsWithStatus = activeTenants.map((t) => {
      const totalPaid = paidMap.get(t.id) || 0
      let paymentStatus: 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon' = 'overdue'
      if (totalPaid >= Number(t.rentAmount)) {
        paymentStatus = 'paid'
      } else if (totalPaid > 0) {
        paymentStatus = 'partial'
      } else {
        // Calendar-based status for unpaid tenants
        if (dayOfMonth <= 2) {
          paymentStatus = 'due-soon'
        } else if (dayOfMonth <= 4) {
          paymentStatus = 'unpaid'
        } else {
          paymentStatus = 'overdue'
        }
      }
      return { ...t, paymentStatus, totalPaid: financialAccess ? totalPaid : 0 }
    })

    // ─── 8. Due soon ───
    const dueSoon = dayOfMonth <= 5 ? overdueTenants : []

    // ─── 9. Properties with tenant counts — lightweight ───
    const properties = await prisma.property.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        nameAr: true,
        nameBn: true,
        nameUr: true,
        type: true,
        address: true,
        totalUnits: true,
        floors: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        tenants: {
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
      },
    })

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

    // ─── 10. Maintenance items — only recent/active (bounded to 50) ───
    const maintenanceItems = await prisma.maintenance.findMany({
      where: { companyId, deletedAt: null, status: { not: 'completed' } },
      include: {
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ─── 11. Expenses — only current month for dashboard (bounded) ───
    const expensesThisMonth = await prisma.expense.findMany({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })

    // ─── 12. Recurring Bills & Utilities stats (single source of truth) ───
    const [
      activeBillsCount,
      billsOutstandingAggregate,
      billsDueThisMonthAggregate,
      billsPaidThisMonthAggregate,
      overdueBillsCount,
    ] = await Promise.all([
      prisma.recurringBill.count({
        where: { companyId, deletedAt: null, status: 'active' },
      }),
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
        where: {
          companyId,
          deletedAt: null,
          status: 'active',
          nextDueDate: { lt: now },
        },
      }),
    ])

    const utilityBillsOutstanding = safeNumber(billsOutstandingAggregate._sum.currentOutstanding)
    const utilityBillsDueThisMonth = safeNumber(billsDueThisMonthAggregate._sum.amount)
    const utilityBillsPaidThisMonth = safeNumber(billsPaidThisMonthAggregate._sum.amount)

    // ─── 13. Reservation stats ───
    const [
      pendingReservationsCount,
      confirmedReservationsCount,
      convertedReservationsCount,
      cancelledReservationsCount,
      totalDepositsCollectedAggregate,
      upcomingMoveInsCount,
    ] = await Promise.all([
      prisma.reservation.count({
        where: { companyId, deletedAt: null, status: 'pending' },
      }),
      prisma.reservation.count({
        where: { companyId, deletedAt: null, status: 'confirmed' },
      }),
      prisma.reservation.count({
        where: { companyId, deletedAt: null, status: 'converted' },
      }),
      prisma.reservation.count({
        where: { companyId, deletedAt: null, status: 'cancelled' },
      }),
      prisma.reservation.aggregate({
        where: { companyId, deletedAt: null, depositStatus: 'paid' },
        _sum: { depositAmount: true },
      }),
      prisma.reservation.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'confirmed',
          expectedMoveInDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ])

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
        : recentPayments.map(({ amount, ...rest }) => ({
            ...serialize(rest),
            amount: 0,
          })),
      chartData: financialAccess
        ? chartData
        : chartData.map((d) => ({ month: d.month, expected: 0, collected: 0 })),
      properties: propertiesWithCounts.map((p) => serialize(p)),
      expenses: financialAccess
        ? expensesThisMonth.map((e) => serialize(e))
        : expensesThisMonth.map(({ amount, ...rest }) => ({
            ...serialize(rest),
            amount: 0,
          })),
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
