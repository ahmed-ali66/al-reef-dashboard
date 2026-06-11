import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'
import PDFDocument from 'pdfkit'

// GET /api/recurring-bills/export/pdf — generate professional PDF report
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
            select: {
              id: true,
              name: true,
              nameAr: true,
            },
          },
          payments: {
            orderBy: { paymentDate: 'desc' },
            take: 1,
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
        select: { name: true, nameAr: true, phone: true, email: true, address: true },
      }),
      // FIX: Use aggregate query for total paid this month (not just latest payment)
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

    const serializedBills = bills.map(b => serialize(b) as any)

    const activeBills = serializedBills.filter(b => b.status === 'active')

    // Helper: does a bill have any actual payment records?
    // Check: cycle.paidAmount > 0 OR cycle._count.payments > 0 OR bill.lastPaymentDate != null
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

    // FIX: Overdue = nextDueDate < today AND currentOutstanding > 0 (bill.nextDueDate = sole truth)
    const overdueBills = activeBills.filter(b => {
      const dueDate = new Date(new Date(b.nextDueDate).getFullYear(), new Date(b.nextDueDate).getMonth(), new Date(b.nextDueDate).getDate())
      return dueDate < startOfToday && safeNumber(b.currentOutstanding) > 0
    })

    // FIX: Upcoming = nextDueDate >= today AND nextDueDate <= today + 30 days
    const upcomingBills = activeBills.filter(b => {
      const dueDate = new Date(new Date(b.nextDueDate).getFullYear(), new Date(b.nextDueDate).getMonth(), new Date(b.nextDueDate).getDate())
      const thirtyDays = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)
      return dueDate >= startOfToday && dueDate <= thirtyDays
    })

    // FIX: Paid = currentOutstanding <= 0 AND has actual payment records
    // Bills with 0 outstanding and no payments are just "new/unused" — NOT "paid"
    const paidBills = activeBills.filter(b =>
      safeNumber(b.currentOutstanding) <= 0 && hasActualPayments(b)
    )

    // FIX: Partially Paid = has actual payment records AND currentOutstanding > 0
    // Use REAL paidAmount from cycles, NOT fabricated (totalDue - outstanding)
    const partiallyPaidBills = activeBills.filter(b =>
      safeNumber(b.currentOutstanding) > 0 && hasActualPayments(b)
    )

    // Outstanding = all bills with currentOutstanding > 0
    const outstandingBills = activeBills.filter(b => safeNumber(b.currentOutstanding) > 0)

    // Summary metrics — use aggregate for total paid, NO Total Due
    const totalBills = activeBills.length
    const totalOutstanding = activeBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)
    const totalPaidThisMonth = safeNumber(paidAgg._sum.amount)

    // ─── Generate PDF ───
    // FIX: Set bottom margin to 0 to prevent PDFKit auto page breaks.
    // We handle ALL pagination explicitly. Auto page breaks from doc.text()
    // were causing blank pages because PDFKit created a page AND our code
    // also called addPage(), producing an extra empty page.
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 0, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: 'Recurring Bills Report',
        Author: company?.name || 'Al Reef Al Madeena',
        Subject: 'Recurring Bills & Utilities Report',
        CreationDate: now,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const marginLeft = 50
    const marginRight = 50
    const pageWidth = doc.page.width - marginLeft - marginRight
    const pageBottomLimit = 40 // leave space for footer (drawn at end)
    const contentBottomLimit = doc.page.height - 55 // stop content before footer area

    // ─── Helper: Truncate text with ellipsis ───
    const truncateText = (text: string, maxWidth: number, fontName: string, fontSize: number): string => {
      doc.font(fontName).fontSize(fontSize)
      if (doc.widthOfString(text) <= maxWidth) return text
      let truncated = text
      while (truncated.length > 0 && doc.widthOfString(truncated + '...') > maxWidth) {
        truncated = truncated.slice(0, -1)
      }
      return truncated + '...'
    }

    // ─── Helper: Add header with dynamic Y positioning ───
    const addHeader = (): number => {
      let y = marginLeft

      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
      const companyName = company?.name || 'Al Reef Al Madeena'
      doc.text(companyName, marginLeft, y, { width: pageWidth, lineBreak: false })
      y += doc.currentLineHeight() + 8

      doc.fontSize(14).fillColor('#2c3e50').font('Helvetica')
      doc.text('Recurring Bills & Utilities Report', marginLeft, y, { width: pageWidth, lineBreak: false })
      y += doc.currentLineHeight() + 6

      doc.fontSize(9).fillColor('#7f8c8d').font('Helvetica')
      const summaryLine = `Generated: ${today} | Total Bills: ${totalBills} | Outstanding: AED ${totalOutstanding.toFixed(2)} | Paid This Month: AED ${totalPaidThisMonth.toFixed(2)}`
      doc.text(summaryLine, marginLeft, y, { width: pageWidth, lineBreak: false })
      y += doc.currentLineHeight() + 10

      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor('#1a5276').lineWidth(2).stroke()
      y += 10

      return y
    }

    // ─── Helper: Add section title ───
    const addSectionTitle = (title: string, y: number, color: string = '#1a5276'): number => {
      if (y + 50 > contentBottomLimit) {
        doc.addPage()
        y = 50
      }

      doc.fontSize(12).fillColor(color).font('Helvetica-Bold')
      doc.text(title, marginLeft, y, { width: pageWidth, lineBreak: false })
      y += doc.currentLineHeight() + 2
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(color).lineWidth(0.5).stroke()
      y += 8
      return y
    }

    // ─── Helper: Smart column width calculation ───
    type ColumnSpec = { header: string; widthPct: number }

    const drawTable = (columns: ColumnSpec[], rows: string[][], y: number): number => {
      const colWidths = columns.map(c => (c.widthPct / 100) * pageWidth)
      const padding = 4
      const headerFontSize = 8
      const cellFontSize = 7.5
      const headerHeight = 24
      const minRowHeight = 18
      const headerFont = 'Helvetica-Bold'
      const cellFont = 'Helvetica'

      const drawHeader = (startY: number): number => {
        doc.rect(marginLeft, startY, pageWidth, headerHeight).fill('#1a5276')
        let x = marginLeft
        columns.forEach((col, i) => {
          const truncatedHeader = truncateText(col.header, colWidths[i] - padding * 2, headerFont, headerFontSize)
          doc.fontSize(headerFontSize).fillColor('#ffffff').font(headerFont)
          doc.text(truncatedHeader, x + padding, startY + 7, {
            width: colWidths[i] - padding * 2,
            align: 'left',
            lineBreak: false,
          })
          x += colWidths[i]
        })
        return startY + headerHeight
      }

      if (y + headerHeight + minRowHeight > contentBottomLimit) {
        doc.addPage()
        y = 50
      }

      y = drawHeader(y)

      rows.forEach((row, ri) => {
        let maxCellHeight = minRowHeight
        row.forEach((cell, i) => {
          doc.font(cellFont).fontSize(cellFontSize)
          const cellHeight = doc.heightOfString(String(cell), {
            width: colWidths[i] - padding * 2,
          })
          maxCellHeight = Math.max(maxCellHeight, cellHeight + 8)
        })
        maxCellHeight = Math.min(maxCellHeight, 60)

        if (y + maxCellHeight > contentBottomLimit) {
          doc.addPage()
          y = 50
          y = drawHeader(y)
        }

        if (ri % 2 === 0) {
          doc.rect(marginLeft, y, pageWidth, maxCellHeight).fill('#f8f9fa')
        }

        let x = marginLeft
        row.forEach((cell, i) => {
          const truncated = truncateText(String(cell), colWidths[i] - padding * 2, cellFont, cellFontSize)
          doc.fontSize(cellFontSize).fillColor('#2c3e50').font(cellFont)
          doc.text(truncated, x + padding, y + 4, {
            width: colWidths[i] - padding * 2,
            align: 'left',
            lineBreak: false,
            ellipsis: true,
          })
          x += colWidths[i]
        })
        y += maxCellHeight
      })

      return y + 8
    }

    // ─── Build PDF Content ───

    let y = addHeader()

    // Summary Statistics Box — NO "Total Due"
    y = addSectionTitle('Summary Statistics', y)
    const summaryData = [
      ['Total Bills', String(totalBills)],
      ['Total Outstanding', `AED ${totalOutstanding.toFixed(2)}`],
      ['Paid This Month', `AED ${totalPaidThisMonth.toFixed(2)}`],
      ['Overdue Bills', String(overdueBills.length)],
      ['Upcoming Bills (30 days)', String(upcomingBills.length)],
      ['Paid Bills', String(paidBills.length)],
      ['Partially Paid', String(partiallyPaidBills.length)],
    ]

    summaryData.forEach((item, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const sx = marginLeft + col * (pageWidth / 2)
      const sy = y + row * 18

      doc.fontSize(9).fillColor('#7f8c8d').font('Helvetica')
      doc.text(`${item[0]}:`, sx + 4, sy, { width: pageWidth / 2 - 60, lineBreak: false })
      doc.fontSize(9).fillColor('#2c3e50').font('Helvetica-Bold')
      doc.text(item[1], sx + pageWidth / 2 - 80, sy, { width: 76, align: 'right', lineBreak: false })
    })
    y += Math.ceil(summaryData.length / 2) * 18 + 15

    // Overdue Bills Section
    if (overdueBills.length > 0) {
      y = addSectionTitle(`Overdue Bills (${overdueBills.length})`, y, '#c0392b')
      const overdueRows = overdueBills.map(b => {
        const dueDate = new Date(b.nextDueDate)
        const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
        const daysOverdue = Math.max(0, Math.ceil((startOfToday.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.accountNumber || '—',
          b.property?.name || b.buildingName || '-',
          `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
          `${daysOverdue} days`,
          b.serviceType,
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Outstanding', widthPct: 15 },
        { header: 'Days Overdue', widthPct: 12.5 },
        { header: 'Type', widthPct: 12.5 },
      ], overdueRows, y)
    }

    // Upcoming Bills Section
    if (upcomingBills.length > 0) {
      y = addSectionTitle(`Upcoming Bills (${upcomingBills.length})`, y, '#e67e22')
      const upcomingRows = upcomingBills.map(b => {
        const dueDate = new Date(b.nextDueDate)
        const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
        const daysRemaining = Math.max(0, Math.ceil((dueDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.accountNumber || '—',
          b.property?.name || b.buildingName || '-',
          `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
          dueDate.toISOString().split('T')[0],
          `${daysRemaining} days`,
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Outstanding', widthPct: 15 },
        { header: 'Due Date', widthPct: 12.5 },
        { header: 'Remaining', widthPct: 12.5 },
      ], upcomingRows, y)
    }

    // FIX: Paid Bills — only include bills with ACTUAL payment records
    if (paidBills.length > 0) {
      y = addSectionTitle(`Paid Bills (${paidBills.length})`, y, '#27ae60')
      const paidRows = paidBills.map(b => {
        const actualPaid = getActualPaidAmount(b)
        return [
          b.providerName,
          b.accountNumber || '—',
          b.property?.name || b.buildingName || '-',
          `AED ${actualPaid.toFixed(2)}`,
          b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '-',
          b.payments?.[0]?.reference || '-',
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Amount Paid', widthPct: 15 },
        { header: 'Payment Date', widthPct: 12.5 },
        { header: 'Reference', widthPct: 12.5 },
      ], paidRows, y)
    }

    // FIX: Partially Paid Bills — only include bills with ACTUAL payment records
    // Show REAL paidAmount from cycles, NOT fabricated (totalDue - outstanding)
    if (partiallyPaidBills.length > 0) {
      y = addSectionTitle(`Partially Paid Bills (${partiallyPaidBills.length})`, y, '#8e44ad')
      const partialRows = partiallyPaidBills.map(b => {
        const actualPaid = getActualPaidAmount(b)
        const outstanding = safeNumber(b.currentOutstanding)
        return [
          b.providerName,
          b.accountNumber || '—',
          b.property?.name || b.buildingName || '-',
          `AED ${actualPaid.toFixed(2)}`,
          `AED ${outstanding.toFixed(2)}`,
          new Date(b.nextDueDate).toISOString().split('T')[0],
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 22 },
        { header: 'Account#', widthPct: 13 },
        { header: 'Property', widthPct: 20 },
        { header: 'Amount Paid', widthPct: 15 },
        { header: 'Remaining', widthPct: 15 },
        { header: 'Due Date', widthPct: 15 },
      ], partialRows, y)
    }

    // Outstanding Balance Summary — show only current outstanding, no confusing "Previous"
    if (outstandingBills.length > 0) {
      y = addSectionTitle(`Outstanding Balances (${outstandingBills.length})`, y, '#c0392b')
      const outstandingRows = outstandingBills.map(b => [
        b.providerName,
        b.accountNumber || '—',
        b.property?.name || b.buildingName || '-',
        `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
        b.serviceType,
      ])
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 25 },
        { header: 'Outstanding', widthPct: 20 },
        { header: 'Type', widthPct: 15 },
      ], outstandingRows, y)

      // FIX: Total Outstanding only — remove confusing "Previous Liability"
      const totalCurr = outstandingBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)

      if (y + 25 > contentBottomLimit) {
        doc.addPage()
        y = 50
      }

      doc.fontSize(10).fillColor('#c0392b').font('Helvetica-Bold')
      doc.text(`Total Outstanding: AED ${totalCurr.toFixed(2)}`, marginLeft, y, { width: pageWidth, lineBreak: false })
      y += 20
    }

    // ─── Add footers to ALL pages at the end ───
    // Using bufferPages: true, we switch to each page and draw the footer
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).fillColor('#95a5a6').font('Helvetica')
      doc.text(
        `Generated by Al Reef Al Madeena Real Estate Management System | ${today} | Confidential`,
        marginLeft,
        doc.page.height - 30,
        { width: pageWidth, align: 'center', lineBreak: false }
      )
    }

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="recurring-bills-report-${today}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generating PDF report:', error)
    return errorResponse('Failed to generate PDF report', 500)
  }
}
