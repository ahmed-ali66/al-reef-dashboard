import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
  serialize,
} from '@/lib/api-utils'
import * as XLSX from 'xlsx'

// GET /api/cheques/export/xlsx — generate professional XLSX report
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) {
      return errorResponse('Only financial users can export reports', 403)
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')?.trim() || undefined
    const propertyId = searchParams.get('propertyId')?.trim() || undefined
    const search = searchParams.get('search')?.trim() || undefined

    const where: any = {
      companyId: user.companyId,
      deletedAt: null,
    }
    if (statusFilter) where.status = statusFilter
    if (propertyId) where.propertyId = propertyId
    if (search) {
      where.OR = [
        { payeeName: { contains: search, mode: 'insensitive' } },
        { chequeNumber: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [cheques, company] = await Promise.all([
      prisma.cheque.findMany({
        where,
        include: {
          property: { select: { id: true, name: true, type: true } },
          payments: {
            orderBy: { paymentDate: 'desc' },
            select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true, notes: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }],
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true, phone: true, email: true },
      }),
    ])

    if (cheques.length === 0) {
      return errorResponse('No cheques to export', 404)
    }

    // Compute paid-so-far/remaining per cheque
    const chequesWithSums = cheques.map(c => {
      const s = serialize(c)
      const totalPaid = (c.payments || []).reduce((sum, p) => sum + safeNumber(p.amount), 0)
      const chequeAmount = safeNumber(c.amount)
      s.totalPaid = Number(totalPaid.toFixed(2))
      s.remaining = Number(Math.max(0, chequeAmount - totalPaid).toFixed(2))
      return s
    })

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Classification
    const fullyPaid = chequesWithSums.filter(c => c.status === 'paid')
    const partiallyPaid = chequesWithSums.filter(c => c.status === 'partially_paid')
    const unpaid = chequesWithSums.filter(c => c.status === 'pending' || c.status === 'bounced' || c.status === 'cancelled')

    const wb = XLSX.utils.book_new()

    // ─── Summary Sheet ───
    const summaryData: any[][] = [
      ['Cheques Report'],
      ['Company', company?.name || 'Al Reef Al Madeena'],
      ['Generated', today],
      [''],
      ['Metric', 'Value'],
      ['Total Cheques', chequesWithSums.length],
      ['Total Amount (AED)', chequesWithSums.reduce((s, c) => s + safeNumber(c.amount), 0).toFixed(2)],
      ['Total Paid (AED)', chequesWithSums.reduce((s, c) => s + safeNumber(c.totalPaid), 0).toFixed(2)],
      ['Total Remaining (AED)', chequesWithSums.reduce((s, c) => s + safeNumber(c.remaining), 0).toFixed(2)],
      ['Fully Paid', fullyPaid.length],
      ['Partially Paid', partiallyPaid.length],
      ['Unpaid', unpaid.length],
    ]
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // ─── All Cheques Sheet ───
    const allHeader = ['Property', 'Property Type', 'Payee', 'Payee Mobile', 'Cheque Amount (AED)', 'Paid So Far (AED)', 'Remaining (AED)', 'Due Date', 'Status', 'Paid Date', 'Cheque Number', 'Bank Name', 'Notes', 'Payment Count']
    const allRows = chequesWithSums.map(c => [
      c.property?.name || '',
      c.property?.type || '',
      c.payeeName,
      c.payeeMobile || '',
      safeNumber(c.amount).toFixed(2),
      safeNumber(c.totalPaid).toFixed(2),
      safeNumber(c.remaining).toFixed(2),
      new Date(c.dueDate).toISOString().split('T')[0],
      c.status,
      c.paidDate ? new Date(c.paidDate).toISOString().split('T')[0] : '',
      c.chequeNumber || '',
      c.bankName || '',
      c.notes || '',
      c.payments?.length || 0,
    ])
    const allTotal = chequesWithSums.reduce((s, c) => s + safeNumber(c.amount), 0)
    const allPaidTotal = chequesWithSums.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
    const allRemainingTotal = chequesWithSums.reduce((s, c) => s + safeNumber(c.remaining), 0)
    const allTotalRow = ['', '', '', `TOTAL (${chequesWithSums.length} cheques)`, allTotal.toFixed(2), allPaidTotal.toFixed(2), allRemainingTotal.toFixed(2), '', '', '', '', '', '', '']
    const allWs = XLSX.utils.aoa_to_sheet([allHeader, ...allRows, allTotalRow])
    allWs['!cols'] = allHeader.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, allWs, 'All Cheques')

    // ─── Fully Paid Sheet ───
    if (fullyPaid.length > 0) {
      const header = ['Property', 'Payee', 'Payee Mobile', 'Amount (AED)', 'Paid (AED)', 'Paid Date', 'Cheque Number', 'Bank Name']
      const rows = fullyPaid.map(c => [
        c.property?.name || '',
        c.payeeName,
        c.payeeMobile || '',
        safeNumber(c.amount).toFixed(2),
        safeNumber(c.totalPaid).toFixed(2),
        c.paidDate ? new Date(c.paidDate).toISOString().split('T')[0] : '',
        c.chequeNumber || '',
        c.bankName || '',
      ])
      const total = fullyPaid.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
      const totalRow = ['', '', '', `TOTAL (${fullyPaid.length} cheques)`, total.toFixed(2), '', '', '']
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow])
      ws['!cols'] = header.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, ws, 'Fully Paid')
    }

    // ─── Partially Paid Sheet ───
    if (partiallyPaid.length > 0) {
      const header = ['Property', 'Payee', 'Payee Mobile', 'Cheque Amount (AED)', 'Paid So Far (AED)', 'Remaining (AED)', 'Due Date', 'Cheque Number']
      const rows = partiallyPaid.map(c => [
        c.property?.name || '',
        c.payeeName,
        c.payeeMobile || '',
        safeNumber(c.amount).toFixed(2),
        safeNumber(c.totalPaid).toFixed(2),
        safeNumber(c.remaining).toFixed(2),
        new Date(c.dueDate).toISOString().split('T')[0],
        c.chequeNumber || '',
      ])
      const paidTotal = partiallyPaid.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
      const remainingTotal = partiallyPaid.reduce((s, c) => s + safeNumber(c.remaining), 0)
      const totalRow = ['', '', '', `TOTAL (${partiallyPaid.length} cheques)`, paidTotal.toFixed(2), remainingTotal.toFixed(2), '', '']
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow])
      ws['!cols'] = header.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, ws, 'Partially Paid')
    }

    // ─── Unpaid Sheet ───
    if (unpaid.length > 0) {
      const header = ['Property', 'Payee', 'Payee Mobile', 'Amount (AED)', 'Due Date', 'Status', 'Cheque Number', 'Bank Name']
      const rows = unpaid.map(c => [
        c.property?.name || '',
        c.payeeName,
        c.payeeMobile || '',
        safeNumber(c.amount).toFixed(2),
        new Date(c.dueDate).toISOString().split('T')[0],
        c.status,
        c.chequeNumber || '',
        c.bankName || '',
      ])
      const total = unpaid.reduce((s, c) => s + safeNumber(c.amount), 0)
      const totalRow = ['', '', '', `TOTAL (${unpaid.length} cheques)`, total.toFixed(2), '', '', '']
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow])
      ws['!cols'] = header.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, ws, 'Unpaid')
    }

    // ─── Payments Detail Sheet (all partial + full payments) ───
    const allPayments: any[] = []
    for (const cheque of chequesWithSums) {
      if (cheque.payments && cheque.payments.length > 0) {
        for (const p of cheque.payments) {
          allPayments.push([
            cheque.property?.name || '',
            cheque.payeeName,
            cheque.chequeNumber || '',
            safeNumber(p.amount).toFixed(2),
            new Date(p.paymentDate).toISOString().split('T')[0],
            p.paymentMethod || '',
            p.reference || '',
            p.notes || '',
          ])
        }
      }
    }
    if (allPayments.length > 0) {
      const header = ['Property', 'Payee', 'Cheque Number', 'Payment Amount (AED)', 'Payment Date', 'Payment Method', 'Reference', 'Notes']
      const paymentsTotal = allPayments.reduce((s, p) => s + parseFloat(p[3]), 0)
      const totalRow = ['', '', '', `TOTAL (${allPayments.length} payments)`, paymentsTotal.toFixed(2), '', '', '']
      const ws = XLSX.utils.aoa_to_sheet([header, ...allPayments, totalRow])
      ws['!cols'] = header.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, ws, 'Payments Detail')
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cheques-report-${today}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error generating cheques XLSX report:', error)
    return errorResponse('Failed to generate XLSX report', 500)
  }
}
