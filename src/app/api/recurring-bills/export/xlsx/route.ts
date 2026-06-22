import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'
import * as XLSX from 'xlsx'

// GET /api/recurring-bills/export/xlsx — generate professional XLSX report
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) {
      return errorResponse('Only financial users can export reports', 403)
    }

    const { searchParams } = new URL(request.url)
    const serviceType = searchParams.get('serviceType')?.trim() || undefined
    const statusFilter = searchParams.get('status')?.trim() || undefined
    const dateFrom = searchParams.get('dateFrom')?.trim() || undefined
    const dateTo = searchParams.get('dateTo')?.trim() || undefined
    const targetMonth = searchParams.get('month')?.trim() || undefined
    const targetYear = searchParams.get('year')?.trim() || undefined

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    if (serviceType) where.serviceType = serviceType
    if (statusFilter) where.status = statusFilter

    // Month/year filtering: filter bills by cycles due in the selected month
    if (targetMonth && targetYear) {
      const m = parseInt(targetMonth)
      const y = parseInt(targetYear)
      const monthStart = new Date(y, m - 1, 1)
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999)
      where.cycles = {
        some: {
          dueDate: { gte: monthStart, lte: monthEnd },
        },
      }
    } else if (dateFrom || dateTo) {
      where.nextDueDate = {}
      if (dateFrom) where.nextDueDate.gte = new Date(dateFrom)
      if (dateTo) where.nextDueDate.lte = new Date(dateTo + 'T23:59:59.999')
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Month boundaries for paid aggregation
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    // Fetch bills AND total paid amount in parallel
    const [bills, company, paidAgg] = await Promise.all([
      prisma.recurringBill.findMany({
        where,
        include: {
          property: {
            select: { id: true, name: true },
          },
          payments: {
            orderBy: { paymentDate: 'desc' },
            take: 5,
          },
          cycles: {
            orderBy: { dueDate: 'desc' as const },
            take: 10,
            include: {
              _count: { select: { payments: true } },
            },
          },
        },
        orderBy: [
          { property: { name: 'asc' } },
          { buildingName: 'asc' },
          { serviceType: 'asc' },
        ],
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      }),
      // FIX: Use aggregate query for total paid this month
      prisma.billPayment.aggregate({
        where: {
          companyId: user.companyId,
          paymentDate: { gte: monthStart, lte: monthEnd },
          recurringBill: { deletedAt: null },
        },
        _sum: { amount: true },
      }),
    ])

    if (bills.length === 0) {
      return errorResponse('No bills to export', 404)
    }

    // FIX: bill.nextDueDate is the SINGLE source of truth for all date logic.
    // FIX: Do NOT fabricate totalAmountDue via "correctedBills" logic.
    // FIX: Only classify bills as "Paid" or "Partially Paid" if they have ACTUAL payment records.

    const activeBills = bills.filter(b => b.status === 'active')

    // Helper: does a bill have any actual payment records?
    const hasActualPayments = (bill: any): boolean => {
      if (bill.lastPaymentDate) return true
      if (bill.cycles && bill.cycles.length > 0) {
        return bill.cycles.some((c: any) =>
          safeNumber(c.paidAmount) > 0 || (c._count?.payments ?? 0) > 0
        )
      }
      return false
    }

    // Helper: get the total actual paid amount from cycle data
    const getActualPaidAmount = (bill: any): number => {
      if (!bill.cycles || bill.cycles.length === 0) return 0
      return bill.cycles.reduce((sum: number, c: any) => sum + safeNumber(c.paidAmount), 0)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SIMPLIFIED 3-BUCKET CLASSIFICATION — matches the PDF exactly.
    // Every active bill appears in EXACTLY ONE bucket:
    //   1. Fully Paid     → currentOutstanding <= 0 AND has actual payment records
    //   2. Partially Paid → currentOutstanding > 0  AND has actual payment records
    //   3. Unpaid         → NO payment records (regardless of currentOutstanding)
    // ─────────────────────────────────────────────────────────────────────────

    const fullyPaidBills = activeBills.filter(b =>
      parseFloat(String(b.currentOutstanding)) <= 0 && hasActualPayments(b)
    )

    const partiallyPaidBills = activeBills.filter(b =>
      parseFloat(String(b.currentOutstanding)) > 0 && hasActualPayments(b)
    )

    const unpaidBills = activeBills.filter(b => !hasActualPayments(b))

    // Overdue is a status flag within Unpaid (not a separate sheet).
    // Used for the optional callout in the Summary sheet.
    const isOverdue = (b: any): boolean => {
      const dueDate = new Date(b.nextDueDate)
      const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
      return dueDay < startOfToday && parseFloat(String(b.currentOutstanding)) > 0
    }
    const overdueUnpaidCount = unpaidBills.filter(isOverdue).length

    // Sort unpaid bills by nextDueDate ascending — overdue bills appear first
    unpaidBills.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())

    // Helper: format "Days Until Due" — matches the PDF helper
    const formatDaysUntilDue = (nextDueDate: string): string => {
      const dueDate = new Date(nextDueDate)
      const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
      const diffMs = dueDay.getTime() - startOfToday.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays > 0) return `${diffDays} days`
      if (diffDays === 0) return 'Due today'
      return `${Math.abs(diffDays)} days overdue`
    }

    // Summary metrics — use aggregate for total paid
    const totalPaidThisMonth = safeNumber(paidAgg._sum.amount)

    // Create workbook
    const wb = XLSX.utils.book_new()

    // ─── Summary Sheet — 3-bucket counts (matches PDF Summary Statistics) ───
    const summaryData: any[][] = [
      ['Recurring Bills & Utilities Report'],
      ['Company', company?.name || 'Al Reef Al Madeena'],
      ['Generated', today],
      [''],
      ['Metric', 'Value'],
      ['Total Bills', activeBills.length],
      ['Total Outstanding (AED)', activeBills.reduce((s, b) => s + parseFloat(String(b.currentOutstanding)), 0).toFixed(2)],
      ['Total Bills Paid This Month (AED)', totalPaidThisMonth.toFixed(2)],
      ['Fully Paid', fullyPaidBills.length],
      ['Partially Paid', partiallyPaidBills.length],
      ['Unpaid', unpaidBills.length],
    ]
    if (overdueUnpaidCount > 0) {
      summaryData.push(['Overdue (subset of Unpaid)', overdueUnpaidCount])
    }
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // ─── All Bills Sheet — uses bill.currentOutstanding (not totalAmountDue) ───
    const allBillsHeader = ['Provider', 'Service Type', 'Property', 'Building', 'Owner', 'Account No.', 'Contract No.', 'Outstanding (AED)', 'Previous Outstanding (AED)', 'Next Due Date', 'Billing Frequency', 'Status', 'Last Payment Date', 'Last Payment Amount (AED)', 'Grace Period (Days)', 'Auto Renew']
    const allBillsRows = bills.map(b => [
      b.providerName,
      b.serviceType,
      b.property?.name || '',
      b.buildingName || '',
      b.ownerName || '',
      b.accountNumber || '',
      b.contractNumber || '',
      parseFloat(String(b.currentOutstanding)).toFixed(2),
      parseFloat(String(b.previousOutstanding)).toFixed(2),
      b.nextDueDate.toISOString().split('T')[0],
      b.billingFrequency,
      b.status,
      b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '',
      b.lastPaymentAmount ? parseFloat(String(b.lastPaymentAmount)).toFixed(2) : '',
      b.gracePeriodDays,
      b.autoRenew ? 'Yes' : 'No',
    ])
    const allBillsWs = XLSX.utils.aoa_to_sheet([allBillsHeader, ...allBillsRows])
    allBillsWs['!cols'] = allBillsHeader.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, allBillsWs, 'All Bills')

    // ═══════════════════════════════════════════════════════════════════════
    // SHEET 2 of 4: FULLY PAID BILLS (currentOutstanding=0 AND has payments)
    // ═══════════════════════════════════════════════════════════════════════
    if (fullyPaidBills.length > 0) {
      const fullyPaidHeader = ['Provider', 'Account No.', 'Owner', 'Property', 'Amount Paid (AED)', 'Payment Date', 'Payment Method', 'Reference']
      const fullyPaidRows = fullyPaidBills.map(b => {
        const actualPaid = getActualPaidAmount(b)
        return [
          b.providerName,
          b.accountNumber || '',
          b.ownerName || '',
          b.property?.name || b.buildingName || '',
          actualPaid.toFixed(2),
          b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '',
          b.payments?.[0]?.paymentMethod || '',
          b.payments?.[0]?.reference || '',
        ]
      })
      const fullyPaidTotal = fullyPaidBills.reduce((s, b) => s + getActualPaidAmount(b), 0)
      const fullyPaidTotalRow = ['', '', '', `TOTAL (${fullyPaidBills.length} bills)`, fullyPaidTotal.toFixed(2), '', '', '']
      const fullyPaidWs = XLSX.utils.aoa_to_sheet([fullyPaidHeader, ...fullyPaidRows, fullyPaidTotalRow])
      fullyPaidWs['!cols'] = fullyPaidHeader.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, fullyPaidWs, 'Fully Paid')
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SHEET 3 of 4: PARTIALLY PAID BILLS (currentOutstanding>0 AND has payments)
    // ═══════════════════════════════════════════════════════════════════════
    if (partiallyPaidBills.length > 0) {
      const partialHeader = ['Provider', 'Account No.', 'Owner', 'Property', 'Amount Paid (AED)', 'Outstanding (AED)', 'Due Date', 'Service Type']
      const partialRows = partiallyPaidBills.map(b => {
        const actualPaid = getActualPaidAmount(b)
        const outstanding = parseFloat(String(b.currentOutstanding))
        return [
          b.providerName,
          b.accountNumber || '',
          b.ownerName || '',
          b.property?.name || b.buildingName || '',
          actualPaid.toFixed(2),
          outstanding.toFixed(2),
          b.nextDueDate.toISOString().split('T')[0],
          b.serviceType,
        ]
      })
      const partialPaidTotal = partiallyPaidBills.reduce((s, b) => s + getActualPaidAmount(b), 0)
      const partialOutstandingTotal = partiallyPaidBills.reduce((s, b) => s + parseFloat(String(b.currentOutstanding)), 0)
      const partialTotalRow = ['', '', '', `TOTAL (${partiallyPaidBills.length} bills)`, partialPaidTotal.toFixed(2), partialOutstandingTotal.toFixed(2), '', '']
      const partialWs = XLSX.utils.aoa_to_sheet([partialHeader, ...partialRows, partialTotalRow])
      partialWs['!cols'] = partialHeader.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, partialWs, 'Partially Paid')
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SHEET 4 of 4: UNPAID BILLS (NO payment records)
    // Sorted by nextDueDate ascending — overdue bills appear first.
    // "Days Until Due" column: positive=N days, 0=Due today, negative=N days overdue.
    // ═══════════════════════════════════════════════════════════════════════
    if (unpaidBills.length > 0) {
      const unpaidHeader = ['Provider', 'Account No.', 'Owner', 'Property', 'Outstanding (AED)', 'Due Date', 'Days Until Due', 'Service Type']
      const unpaidRows = unpaidBills.map(b => [
        b.providerName,
        b.accountNumber || '',
        b.ownerName || '',
        b.property?.name || b.buildingName || '',
        parseFloat(String(b.currentOutstanding)).toFixed(2),
        b.nextDueDate.toISOString().split('T')[0],
        formatDaysUntilDue(b.nextDueDate),
        b.serviceType,
      ])
      const unpaidTotal = unpaidBills.reduce((s, b) => s + parseFloat(String(b.currentOutstanding)), 0)
      const unpaidTotalRow = ['', '', '', `TOTAL (${unpaidBills.length} bills)`, unpaidTotal.toFixed(2), '', '', '']
      const unpaidWs = XLSX.utils.aoa_to_sheet([unpaidHeader, ...unpaidRows, unpaidTotalRow])
      unpaidWs['!cols'] = unpaidHeader.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, unpaidWs, 'Unpaid')
    }

    // ─── Billing Cycles Sheet ───
    const allCycles: any[] = []
    for (const bill of bills) {
      if (bill.cycles && bill.cycles.length > 0) {
        for (const cycle of bill.cycles) {
          allCycles.push([
            bill.providerName,
            bill.accountNumber || '',
            bill.serviceType,
            cycle.periodStart.toISOString().split('T')[0],
            cycle.periodEnd.toISOString().split('T')[0],
            parseFloat(String(cycle.amount)).toFixed(2),
            parseFloat(String(cycle.paidAmount)).toFixed(2),
            parseFloat(String(cycle.outstandingAmount)).toFixed(2),
            cycle.status,
            cycle.dueDate.toISOString().split('T')[0],
            cycle._count?.payments || 0,
          ])
        }
      }
    }
    if (allCycles.length > 0) {
      const cycleHeader = ['Provider', 'Account No.', 'Service Type', 'Period Start', 'Period End', 'Amount (AED)', 'Paid (AED)', 'Outstanding (AED)', 'Status', 'Due Date', 'Payments']
      const cycleWs = XLSX.utils.aoa_to_sheet([cycleHeader, ...allCycles])
      cycleWs['!cols'] = cycleHeader.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, cycleWs, 'Billing Cycles')
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="recurring-bills-report-${today}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error generating XLSX report:', error)
    return errorResponse('Failed to generate XLSX report', 500)
  }
}
