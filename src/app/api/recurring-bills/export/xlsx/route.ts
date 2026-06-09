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

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }

    if (serviceType) where.serviceType = serviceType
    if (statusFilter) where.status = statusFilter

    if (dateFrom || dateTo) {
      where.nextDueDate = {}
      if (dateFrom) where.nextDueDate.gte = new Date(dateFrom)
      if (dateTo) where.nextDueDate.lte = new Date(dateTo + 'T23:59:59.999')
    }

    const [bills, company] = await Promise.all([
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
            take: 5,
            include: {
              _count: { select: { payments: true } },
            },
          },
        },
        orderBy: { nextDueDate: 'asc' },
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      }),
    ])

    if (bills.length === 0) {
      return errorResponse('No bills to export', 404)
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Categorize bills — with cycle-based totalAmountDue correction
    // Fix totalAmountDue: derive from the latest cycle's amount when corrupted
    const correctedBills = bills.map(b => {
      const bill: any = { ...b }
      if (bill.cycles && bill.cycles.length > 0) {
        const latestCycle = bill.cycles[0]
        const cycleAmount = parseFloat(String(latestCycle.amount))
        const storedTotalDue = parseFloat(String(bill.totalAmountDue))
        if (storedTotalDue <= parseFloat(String(bill.currentOutstanding)) || storedTotalDue === 0) {
          bill.totalAmountDue = cycleAmount
        }
      }
      return bill
    })

    const activeBills = correctedBills.filter(b => b.status === 'active')
    const overdueBills = activeBills.filter(b => b.nextDueDate < now)
    const upcomingBills = activeBills.filter(b => b.nextDueDate >= now && b.nextDueDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
    const paidBills = activeBills.filter(b => parseFloat(String(b.currentOutstanding)) <= 0)
    const partiallyPaidBills = activeBills.filter(b => {
      const outstanding = parseFloat(String(b.currentOutstanding))
      const totalDue = parseFloat(String(b.totalAmountDue))
      return outstanding > 0 && outstanding < totalDue
    })

    // Create workbook
    const wb = XLSX.utils.book_new()

    // ─── Summary Sheet ───
    const summaryData = [
      ['Recurring Bills & Utilities Report'],
      ['Company', company?.name || 'Al Reef Al Madeena'],
      ['Generated', today],
      [''],
      ['Metric', 'Value'],
      ['Total Bills', activeBills.length],
      ['Total Outstanding (AED)', activeBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0).toFixed(2)],
      ['Total Due (AED)', activeBills.reduce((s, b) => s + safeNumber(b.totalAmountDue), 0).toFixed(2)],
      ['Overdue Bills', overdueBills.length],
      ['Upcoming Bills (30 days)', upcomingBills.length],
      ['Paid Bills', paidBills.length],
      ['Partially Paid', partiallyPaidBills.length],
      ['Total Overdue Amount (AED)', overdueBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0).toFixed(2)],
      ['Total Upcoming Amount (AED)', upcomingBills.reduce((s, b) => s + safeNumber(b.totalAmountDue), 0).toFixed(2)],
    ]
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // ─── All Bills Sheet ───
    const allBillsHeader = ['Provider', 'Service Type', 'Property', 'Building', 'Owner', 'Account No.', 'Contract No.', 'Total Due (AED)', 'Outstanding (AED)', 'Previous Outstanding (AED)', 'Next Due Date', 'Billing Frequency', 'Status', 'Last Payment Date', 'Last Payment Amount (AED)', 'Grace Period (Days)', 'Auto Renew']
    const allBillsRows = bills.map(b => [
      b.providerName,
      b.serviceType,
      b.property?.name || '',
      b.buildingName || '',
      b.ownerName || '',
      b.accountNumber || '',
      b.contractNumber || '',
      safeNumber(b.totalAmountDue).toFixed(2),
      safeNumber(b.currentOutstanding).toFixed(2),
      safeNumber(b.previousOutstanding).toFixed(2),
      b.nextDueDate.toISOString().split('T')[0],
      b.billingFrequency,
      b.status,
      b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '',
      b.lastPaymentAmount ? safeNumber(b.lastPaymentAmount).toFixed(2) : '',
      b.gracePeriodDays,
      b.autoRenew ? 'Yes' : 'No',
    ])
    const allBillsWs = XLSX.utils.aoa_to_sheet([allBillsHeader, ...allBillsRows])
    allBillsWs['!cols'] = allBillsHeader.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, allBillsWs, 'All Bills')

    // ─── Overdue Bills Sheet ───
    if (overdueBills.length > 0) {
      const overdueHeader = ['Provider', 'Property', 'Outstanding (AED)', 'Days Overdue', 'Service Type', 'Due Date']
      const overdueRows = overdueBills.map(b => {
        const daysOverdue = Math.max(0, Math.ceil((now.getTime() - b.nextDueDate.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.property?.name || b.buildingName || '',
          safeNumber(b.currentOutstanding).toFixed(2),
          daysOverdue,
          b.serviceType,
          b.nextDueDate.toISOString().split('T')[0],
        ]
      })
      const overdueWs = XLSX.utils.aoa_to_sheet([overdueHeader, ...overdueRows])
      overdueWs['!cols'] = overdueHeader.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, overdueWs, 'Overdue')
    }

    // ─── Upcoming Bills Sheet ───
    if (upcomingBills.length > 0) {
      const upcomingHeader = ['Provider', 'Property', 'Amount Due (AED)', 'Due Date', 'Days Remaining', 'Service Type']
      const upcomingRows = upcomingBills.map(b => {
        const daysRemaining = Math.max(0, Math.ceil((b.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.property?.name || b.buildingName || '',
          safeNumber(b.totalAmountDue).toFixed(2),
          b.nextDueDate.toISOString().split('T')[0],
          daysRemaining,
          b.serviceType,
        ]
      })
      const upcomingWs = XLSX.utils.aoa_to_sheet([upcomingHeader, ...upcomingRows])
      upcomingWs['!cols'] = upcomingHeader.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, upcomingWs, 'Upcoming')
    }

    // ─── Paid Bills Sheet ───
    if (paidBills.length > 0) {
      const paidHeader = ['Provider', 'Property', 'Amount (AED)', 'Payment Date', 'Payment Method', 'Reference']
      const paidRows = paidBills.map(b => [
        b.providerName,
        b.property?.name || b.buildingName || '',
        safeNumber(b.totalAmountDue).toFixed(2),
        b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '',
        b.payments?.[0]?.paymentMethod || '',
        b.payments?.[0]?.reference || '',
      ])
      const paidWs = XLSX.utils.aoa_to_sheet([paidHeader, ...paidRows])
      paidWs['!cols'] = paidHeader.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, paidWs, 'Paid')
    }

    // ─── Partially Paid Sheet ───
    if (partiallyPaidBills.length > 0) {
      const partialHeader = ['Provider', 'Property', 'Original Amount (AED)', 'Amount Paid (AED)', 'Remaining Balance (AED)', 'Due Date', 'Service Type']
      const partialRows = partiallyPaidBills.map(b => {
        const totalDue = safeNumber(b.totalAmountDue)
        const outstanding = safeNumber(b.currentOutstanding)
        const paid = totalDue - outstanding
        return [
          b.providerName,
          b.property?.name || b.buildingName || '',
          totalDue.toFixed(2),
          paid.toFixed(2),
          outstanding.toFixed(2),
          b.nextDueDate.toISOString().split('T')[0],
          b.serviceType,
        ]
      })
      const partialWs = XLSX.utils.aoa_to_sheet([partialHeader, ...partialRows])
      partialWs['!cols'] = partialHeader.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, partialWs, 'Partially Paid')
    }

    // ─── Outstanding Balances Sheet ───
    const outstandingBills = activeBills.filter(b => safeNumber(b.currentOutstanding) > 0)
    if (outstandingBills.length > 0) {
      const outstandingHeader = ['Provider', 'Property', 'Previous Balance (AED)', 'Current Balance (AED)', 'Total Liability (AED)', 'Service Type', 'Due Date']
      const outstandingRows = outstandingBills.map(b => [
        b.providerName,
        b.property?.name || b.buildingName || '',
        safeNumber(b.previousOutstanding).toFixed(2),
        safeNumber(b.currentOutstanding).toFixed(2),
        safeNumber(b.totalAmountDue).toFixed(2),
        b.serviceType,
        b.nextDueDate.toISOString().split('T')[0],
      ])
      const outstandingWs = XLSX.utils.aoa_to_sheet([outstandingHeader, ...outstandingRows])
      outstandingWs['!cols'] = outstandingHeader.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, outstandingWs, 'Outstanding')
    }

    // ─── Billing Cycles Sheet ───
    const allCycles: any[] = []
    for (const bill of bills) {
      if (bill.cycles && bill.cycles.length > 0) {
        for (const cycle of bill.cycles) {
          allCycles.push([
            bill.providerName,
            bill.serviceType,
            cycle.periodStart.toISOString().split('T')[0],
            cycle.periodEnd.toISOString().split('T')[0],
            safeNumber(cycle.amount).toFixed(2),
            safeNumber(cycle.paidAmount).toFixed(2),
            safeNumber(cycle.outstandingAmount).toFixed(2),
            cycle.status,
            cycle.dueDate.toISOString().split('T')[0],
            cycle._count?.payments || 0,
          ])
        }
      }
    }
    if (allCycles.length > 0) {
      const cycleHeader = ['Provider', 'Service Type', 'Period Start', 'Period End', 'Amount (AED)', 'Paid (AED)', 'Outstanding (AED)', 'Status', 'Due Date', 'Payments']
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
