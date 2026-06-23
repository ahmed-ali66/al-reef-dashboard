import prisma from '@/lib/db'
import {
  getAuthUser,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
  safeNumber,
  serialize,
} from '@/lib/api-utils'

// GET /api/reports/property-pnl — Property Profit & Loss report
//
// Query params:
//   - propertyId: specific property (omit for portfolio = all properties)
//   - period: this_year | this_quarter | this_month | last_year | all_time (default: this_year)
//
// Returns per-property P&L:
//   INCOME:
//     - expectedRent: annualized rent from active tenants (rentAmount × 12) — for this_year/all_time
//                     prorated for quarter/month periods
//     - collectedRent: sum of payments in selected period (linked via tenant → property)
//     - outstandingRent: expectedRent − collectedRent (for the period)
//     - collectionRate: collectedRent / expectedRent × 100
//   EXPENSES:
//     - ownerCheques: sum of cheques paid in period (status=paid, paidDate in range)
//     - pendingCheques: sum of cheques pending (status=paid, dueDate in range — for cash flow planning)
//     - utilityBills: sum of recurring_bills.currentOutstanding at the property
//     - otherExpenses: sum of expenses where building ILIKE property name (loose match — Expense table has no propertyId FK)
//     - totalExpenses: ownerCheques + utilityBills + otherExpenses
//   PROFIT:
//     - expectedProfit: expectedRent − totalExpenses (annualized)
//     - actualProfit: collectedRent − totalExpenses (for same period)
//     - variance: actualProfit − expectedProfit
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    // P&L is financial-only — owner/admin/accountant
    const isFinancial = user.role === 'owner' || user.role === 'admin' || user.role === 'accountant'
    if (!isFinancial) return forbiddenResponse('Only financial users can view P&L reports')

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const period = searchParams.get('period')?.trim() || 'this_year'

    // Compute period boundaries (UTC, matching the rest of the app)
    const now = new Date()
    let periodStart: Date
    let periodEnd: Date
    let periodLabel: string

    switch (period) {
      case 'this_month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        periodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        break
      case 'this_quarter':
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        periodStart = new Date(now.getFullYear(), qMonth, 1)
        periodEnd = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999)
        periodLabel = `Q${Math.floor(qMonth / 3) + 1} ${now.getFullYear()}`
        break
      case 'last_year':
        periodStart = new Date(now.getFullYear() - 1, 0, 1)
        periodEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
        periodLabel = `${now.getFullYear() - 1}`
        break
      case 'all_time':
        periodStart = new Date(2000, 0, 1)
        periodEnd = new Date(2100, 11, 31, 23, 59, 59, 999)
        periodLabel = 'All Time'
        break
      case 'this_year':
      default:
        periodStart = new Date(now.getFullYear(), 0, 1)
        periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        periodLabel = `${now.getFullYear()}`
        break
    }

    // ─── Build property filter ─────────────────────────────────────────────
    const propertyFilter = propertyId
      ? { id: propertyId, companyId: user.companyId, deletedAt: null }
      : { companyId: user.companyId, deletedAt: null }

    // Fetch properties (with active tenants for rent calculation)
    const properties = await prisma.property.findMany({
      where: propertyFilter,
      include: {
        tenants: {
          where: { deletedAt: null, status: 'active' },
          select: { id: true, rentAmount: true, leaseStart: true, leaseEnd: true },
        },
        recurringBills: {
          where: { deletedAt: null, status: 'active' },
          select: { id: true, currentOutstanding: true, totalAmountDue: true, serviceType: true, providerName: true },
        },
        cheques: {
          where: { deletedAt: null },
          select: {
            id: true,
            amount: true,
            dueDate: true,
            status: true,
            paidDate: true,
            payeeName: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    if (properties.length === 0) {
      return successResponse({
        period: { label: periodLabel, start: periodStart.toISOString(), end: periodEnd.toISOString() },
        properties: [],
        portfolioTotals: null,
        message: 'No properties found',
      })
    }

    // ─── For each property, compute P&L ───────────────────────────────────
    const propertyResults = await Promise.all(properties.map(async (property) => {
      const tenantIds = property.tenants.map(t => t.id)

      // Collected rent: sum of payments linked to tenants at this property, in period
      let collectedRent = 0
      if (tenantIds.length > 0) {
        const paymentAgg = await prisma.payment.aggregate({
          where: {
            tenantId: { in: tenantIds },
            date: { gte: periodStart, lte: periodEnd },
          },
          _sum: { amount: true },
          _count: true,
        })
        collectedRent = safeNumber(paymentAgg._sum.amount)
      }

      // Expected rent: sum of monthly rent × months in period
      // For annual periods (this_year, last_year): rentAmount × 12
      // For all_time: rentAmount × 12 × years from leaseStart to now (approximate)
      // For quarter: rentAmount × 3
      // For month: rentAmount × 1
      const monthlyRentSum = property.tenants.reduce((s, t) => s + safeNumber(t.rentAmount), 0)
      let monthsInPeriod = 12
      if (period === 'this_month') monthsInPeriod = 1
      else if (period === 'this_quarter') monthsInPeriod = 3
      else if (period === 'last_year' || period === 'this_year') monthsInPeriod = 12
      else if (period === 'all_time') {
        // For all_time, use the earliest lease start to now (in years × 12)
        const leaseStarts = property.tenants.map(t => t.leaseStart).filter(Boolean) as Date[]
        if (leaseStarts.length > 0) {
          const earliest = new Date(Math.min(...leaseStarts.map(d => d.getTime())))
          const yearDiff = (now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
          monthsInPeriod = Math.max(1, Math.round(yearDiff * 12))
        } else {
          monthsInPeriod = 12
        }
      }
      const expectedRent = monthlyRentSum * monthsInPeriod

      // Outstanding rent (for the period)
      const outstandingRent = Math.max(0, expectedRent - collectedRent)

      // Collection rate
      const collectionRate = expectedRent > 0 ? (collectedRent / expectedRent) * 100 : 0

      // Owner cheques paid in period
      const chequesPaidInPeriod = property.cheques.filter(c =>
        c.status === 'paid' && c.paidDate &&
        c.paidDate >= periodStart && c.paidDate <= periodEnd
      )
      const ownerChequesPaid = chequesPaidInPeriod.reduce((s, c) => s + safeNumber(c.amount), 0)

      // Pending cheques due in period (for cash flow planning — what we'll owe)
      const chequesDueInPeriod = property.cheques.filter(c =>
        c.status === 'pending' &&
        c.dueDate >= periodStart && c.dueDate <= periodEnd
      )
      const pendingChequesDue = chequesDueInPeriod.reduce((s, c) => s + safeNumber(c.amount), 0)

      // All pending cheques (regardless of period — total outstanding obligation)
      const allPendingCheques = property.cheques.filter(c => c.status === 'pending')
      const totalPendingCheques = allPendingCheques.reduce((s, c) => s + safeNumber(c.amount), 0)

      // Utility bills outstanding (current snapshot, not period-bound)
      const utilityBillsOutstanding = property.recurringBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)

      // Other expenses: match Expense table by building name (loose match — Expense table has no propertyId FK)
      let otherExpenses = 0
      const expensesMatch = await prisma.expense.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          date: { gte: periodStart, lte: periodEnd },
          building: { contains: property.name, mode: 'insensitive' },
        },
        select: { amount: true },
      })
      otherExpenses = expensesMatch.reduce((s, e) => s + safeNumber(e.amount), 0)

      // Total expenses (for the period)
      const totalExpenses = ownerChequesPaid + utilityBillsOutstanding + otherExpenses

      // Profit calculations
      const expectedProfit = expectedRent - (ownerChequesPaid + utilityBillsOutstanding + otherExpenses)
      const actualProfit = collectedRent - totalExpenses
      const variance = actualProfit - expectedProfit

      return {
        property: {
          id: property.id,
          name: property.name,
          type: property.type,
          totalUnits: property.totalUnits,
        },
        tenantCount: property.tenants.length,
        income: {
          expectedRent: Number(expectedRent.toFixed(2)),
          collectedRent: Number(collectedRent.toFixed(2)),
          outstandingRent: Number(outstandingRent.toFixed(2)),
          collectionRate: Number(collectionRate.toFixed(2)),
          monthlyRentSum: Number(monthlyRentSum.toFixed(2)),
        },
        expenses: {
          ownerChequesPaid: Number(ownerChequesPaid.toFixed(2)),
          pendingChequesDue: Number(pendingChequesDue.toFixed(2)),
          totalPendingCheques: Number(totalPendingCheques.toFixed(2)),
          utilityBillsOutstanding: Number(utilityBillsOutstanding.toFixed(2)),
          otherExpenses: Number(otherExpenses.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
        },
        profit: {
          expectedProfit: Number(expectedProfit.toFixed(2)),
          actualProfit: Number(actualProfit.toFixed(2)),
          variance: Number(variance.toFixed(2)),
        },
        chequeCounts: {
          paidInPeriod: chequesPaidInPeriod.length,
          dueInPeriod: chequesDueInPeriod.length,
          totalPending: allPendingCheques.length,
        },
      }
    }))

    // ─── Portfolio totals (aggregate across all properties) ───────────────
    // NOTE: Includes a synthetic `property` field so this object is compatible
    // with the PropertyPnLResult interface used by the frontend's renderPropertyCard.
    // The frontend accesses p.property.id / p.property.name when rendering cards,
    // and portfolioTotals must satisfy the same shape to avoid client-side crashes.
    const portfolioTotals = {
      property: {
        id: 'portfolio',
        name: 'Portfolio Total',
        type: 'portfolio',
        totalUnits: propertyResults.reduce((s, p) => s + (p.property.totalUnits || 0), 0),
      },
      tenantCount: propertyResults.reduce((s, p) => s + p.tenantCount, 0),
      income: {
        expectedRent: Number(propertyResults.reduce((s, p) => s + p.income.expectedRent, 0).toFixed(2)),
        collectedRent: Number(propertyResults.reduce((s, p) => s + p.income.collectedRent, 0).toFixed(2)),
        outstandingRent: Number(propertyResults.reduce((s, p) => s + p.income.outstandingRent, 0).toFixed(2)),
        collectionRate: 0, // computed below
        monthlyRentSum: Number(propertyResults.reduce((s, p) => s + p.income.monthlyRentSum, 0).toFixed(2)),
      },
      expenses: {
        ownerChequesPaid: Number(propertyResults.reduce((s, p) => s + p.expenses.ownerChequesPaid, 0).toFixed(2)),
        pendingChequesDue: Number(propertyResults.reduce((s, p) => s + p.expenses.pendingChequesDue, 0).toFixed(2)),
        totalPendingCheques: Number(propertyResults.reduce((s, p) => s + p.expenses.totalPendingCheques, 0).toFixed(2)),
        utilityBillsOutstanding: Number(propertyResults.reduce((s, p) => s + p.expenses.utilityBillsOutstanding, 0).toFixed(2)),
        otherExpenses: Number(propertyResults.reduce((s, p) => s + p.expenses.otherExpenses, 0).toFixed(2)),
        totalExpenses: Number(propertyResults.reduce((s, p) => s + p.expenses.totalExpenses, 0).toFixed(2)),
      },
      profit: {
        expectedProfit: Number(propertyResults.reduce((s, p) => s + p.profit.expectedProfit, 0).toFixed(2)),
        actualProfit: Number(propertyResults.reduce((s, p) => s + p.profit.actualProfit, 0).toFixed(2)),
        variance: Number(propertyResults.reduce((s, p) => s + p.profit.variance, 0).toFixed(2)),
      },
      chequeCounts: {
        paidInPeriod: propertyResults.reduce((s, p) => s + p.chequeCounts.paidInPeriod, 0),
        dueInPeriod: propertyResults.reduce((s, p) => s + p.chequeCounts.dueInPeriod, 0),
        totalPending: propertyResults.reduce((s, p) => s + p.chequeCounts.totalPending, 0),
      },
    }
    portfolioTotals.income.collectionRate = portfolioTotals.income.expectedRent > 0
      ? Number(((portfolioTotals.income.collectedRent / portfolioTotals.income.expectedRent) * 100).toFixed(2))
      : 0

    return successResponse({
      period: {
        label: periodLabel,
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        type: period,
      },
      filter: { propertyId: propertyId || null },
      properties: propertyResults,
      portfolioTotals,
      asOfDate: now.toISOString(),
    })
  } catch (error) {
    console.error('Error generating property P&L:', error)
    return errorResponse('Failed to generate property P&L report', 500)
  }
}
