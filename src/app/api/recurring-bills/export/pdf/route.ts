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
      // Legacy date range filter (uses bill.nextDueDate for backward compatibility)
      where.nextDueDate = {}
      if (dateFrom) where.nextDueDate.gte = new Date(dateFrom)
      if (dateTo) where.nextDueDate.lte = new Date(dateTo + 'T23:59:59.999')
    }

    const [bills, company] = await Promise.all([
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
            take: 3,
            include: {
              _count: { select: { payments: true } },
            },
          },
        },
        // Sort: Building (property name) > Building Name > Service Type
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
    ])

    if (bills.length === 0) {
      return errorResponse('No bills to export', 404)
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Helper: check if a bill has any overdue cycle (cycle dueDate < today)
    const hasOverdueCycle = (bill: any) => {
      if (!bill.cycles || bill.cycles.length === 0) return false
      return bill.cycles.some((c: any) =>
        ['pending', 'partially_paid', 'overdue'].includes(c.status) &&
        new Date(c.dueDate) < startOfToday
      )
    }

    // Helper: get earliest open cycle dueDate for day calculations
    const getEarliestCycleDue = (bill: any): Date | null => {
      if (!bill.cycles || bill.cycles.length === 0) return null
      const openCycles = bill.cycles.filter((c: any) =>
        ['pending', 'partially_paid', 'overdue'].includes(c.status)
      )
      if (openCycles.length === 0) return null
      return openCycles.reduce((min: Date, c: any) => {
        const d = new Date(c.dueDate)
        return d < min ? d : min
      }, new Date(openCycles[0].dueDate))
    }

    // Categorize bills — with cycle-based totalAmountDue correction
    const correctedBills = bills.map(b => {
      const bill = serialize(b) as any
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
    // FIX: Use cycle-level dueDate for overdue detection, not bill.nextDueDate
    const overdueBills = activeBills.filter(b => hasOverdueCycle(b))
    const upcomingBills = activeBills.filter(b => {
      const cycleDue = getEarliestCycleDue(b)
      const refDate = cycleDue || new Date(b.nextDueDate)
      return refDate >= startOfToday && refDate <= new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)
    })
    const paidBills = activeBills.filter(b => parseFloat(String(b.currentOutstanding)) <= 0)
    const partiallyPaidBills = activeBills.filter(b => {
      const outstanding = parseFloat(String(b.currentOutstanding))
      const totalDue = parseFloat(String(b.totalAmountDue))
      return outstanding > 0 && outstanding < totalDue
    })
    const outstandingBills = activeBills.filter(b => parseFloat(String(b.currentOutstanding)) > 0)

    // Summary metrics
    const totalBills = activeBills.length
    const totalOutstanding = activeBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)
    const totalDue = activeBills.reduce((s, b) => s + safeNumber(b.totalAmountDue), 0)
    const totalPaidAmount = bills.reduce((s, b) => s + (b.payments?.[0] ? safeNumber(b.payments[0].amount) : 0), 0)

    // Generate PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
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

      // Company name — large bold
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
      const companyName = company?.name || 'Al Reef Al Madeena'
      doc.text(companyName, marginLeft, y, { width: pageWidth, lineBreak: true })
      // Track actual height after rendering
      const companyNameHeight = doc.heightOfString(companyName, { width: pageWidth })
      y += companyNameHeight + 8

      // Report title — on its own line with gap
      doc.fontSize(14).fillColor('#2c3e50').font('Helvetica')
      doc.text('Recurring Bills & Utilities Report', marginLeft, y, { width: pageWidth, lineBreak: true })
      const titleHeight = doc.heightOfString('Recurring Bills & Utilities Report', { width: pageWidth })
      y += titleHeight + 6

      // Generated date and summary — on its own line
      doc.fontSize(9).fillColor('#7f8c8d').font('Helvetica')
      const summaryLine = `Generated: ${today} | Total Bills: ${totalBills} | Outstanding: AED ${totalOutstanding.toFixed(2)} | Paid: AED ${totalPaidAmount.toFixed(2)}`
      doc.text(summaryLine, marginLeft, y, { width: pageWidth, lineBreak: true })
      const summaryHeight = doc.heightOfString(summaryLine, { width: pageWidth })
      y += summaryHeight + 10

      // Separator line — drawn AFTER all header content with proper gap
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor('#1a5276').lineWidth(2).stroke()
      y += 10

      return y
    }

    // ─── Helper: Add section title ───
    const addSectionTitle = (title: string, y: number, color: string = '#1a5276'): number => {
      // Check if we need a new page (need at least header + a few rows of space)
      if (y + 50 > doc.page.height - 60) {
        doc.addPage()
        y = 50
      }

      doc.fontSize(12).fillColor(color).font('Helvetica-Bold')
      doc.text(title, marginLeft, y, { width: pageWidth, lineBreak: true })
      const titleH = doc.heightOfString(title, { width: pageWidth })
      y += titleH + 2
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(color).lineWidth(0.5).stroke()
      y += 8
      return y
    }

    // ─── Helper: Add footer to current page ───
    const addFooter = () => {
      const footerY = doc.page.height - 35
      doc.fontSize(7).fillColor('#95a5a6').font('Helvetica')
      doc.text(
        `Generated by Al Reef Al Madeena Real Estate Management System | ${today} | Confidential`,
        marginLeft,
        footerY,
        { width: pageWidth, align: 'center' }
      )
    }

    // ─── Helper: Smart column width calculation ───
    // Column importance: provider(25%), account#(15%), property(20%), numbers(15%), dates/status(12.5% each)
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

      // Helper to draw table header
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

      // Check if we need a new page
      if (y + headerHeight + minRowHeight > doc.page.height - 60) {
        addFooter()
        doc.addPage()
        y = 50
      }

      y = drawHeader(y)

      // Draw rows
      rows.forEach((row, ri) => {
        // Calculate row height based on the tallest cell
        let maxCellHeight = minRowHeight
        row.forEach((cell, i) => {
          doc.font(cellFont).fontSize(cellFontSize)
          const cellHeight = doc.heightOfString(String(cell), {
            width: colWidths[i] - padding * 2,
            lineBreak: true,
          })
          maxCellHeight = Math.max(maxCellHeight, cellHeight + 8)
        })

        // Cap row height to prevent overflow
        maxCellHeight = Math.min(maxCellHeight, 60)

        // Check for page break
        if (y + maxCellHeight > doc.page.height - 60) {
          addFooter()
          doc.addPage()
          y = 50
          y = drawHeader(y)
        }

        // Alternate row background
        if (ri % 2 === 0) {
          doc.rect(marginLeft, y, pageWidth, maxCellHeight).fill('#f8f9fa')
        }

        // Draw cells
        let x = marginLeft
        row.forEach((cell, i) => {
          const truncated = truncateText(String(cell), colWidths[i] - padding * 2, cellFont, cellFontSize)
          doc.fontSize(cellFontSize).fillColor('#2c3e50').font(cellFont)
          doc.text(truncated, x + padding, y + 4, {
            width: colWidths[i] - padding * 2,
            align: 'left',
            lineBreak: true,
            height: maxCellHeight - 6,
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

    // Summary Statistics Box
    y = addSectionTitle('Summary Statistics', y)
    const summaryData = [
      ['Total Bills', String(totalBills)],
      ['Total Outstanding', `AED ${totalOutstanding.toFixed(2)}`],
      ['Total Due', `AED ${totalDue.toFixed(2)}`],
      ['Overdue Bills', String(overdueBills.length)],
      ['Upcoming Bills (30 days)', String(upcomingBills.length)],
      ['Paid Bills', String(paidBills.length)],
      ['Partially Paid', String(partiallyPaidBills.length)],
    ]

    // Draw summary in two columns
    summaryData.forEach((item, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const sx = marginLeft + col * (pageWidth / 2)
      const sy = y + row * 18

      doc.fontSize(9).fillColor('#7f8c8d').font('Helvetica')
      doc.text(`${item[0]}:`, sx + 4, sy, { width: pageWidth / 2 - 60 })
      doc.fontSize(9).fillColor('#2c3e50').font('Helvetica-Bold')
      doc.text(item[1], sx + pageWidth / 2 - 80, sy, { width: 76, align: 'right' })
    })
    y += Math.ceil(summaryData.length / 2) * 18 + 15

    // Overdue Bills Section
    if (overdueBills.length > 0) {
      y = addSectionTitle(`Overdue Bills (${overdueBills.length})`, y, '#c0392b')
      const overdueRows = overdueBills.map(b => {
        // FIX: Use cycle-level dueDate for days overdue calculation
        const cycleDue = getEarliestCycleDue(b)
        const overdueRefDate = cycleDue ? cycleDue.toISOString() : b.nextDueDate
        const daysOverdue = Math.max(0, Math.ceil((startOfToday.getTime() - new Date(overdueRefDate).getTime()) / (1000 * 60 * 60 * 24)))
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
        // FIX: Use cycle-level dueDate for days remaining calculation
        const upcomingCycleDue = getEarliestCycleDue(b)
        const upcomingRefDate = upcomingCycleDue ? upcomingCycleDue.toISOString() : b.nextDueDate
        const dueDate = new Date(upcomingRefDate)
        const daysRemaining = Math.max(0, Math.ceil((dueDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.accountNumber || '—',
          b.property?.name || b.buildingName || '-',
          `AED ${safeNumber(b.totalAmountDue).toFixed(2)}`,
          dueDate.toISOString().split('T')[0],
          `${daysRemaining} days`,
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Amount Due', widthPct: 15 },
        { header: 'Due Date', widthPct: 12.5 },
        { header: 'Remaining', widthPct: 12.5 },
      ], upcomingRows, y)
    }

    // Paid Bills Section
    if (paidBills.length > 0) {
      y = addSectionTitle(`Paid Bills (${paidBills.length})`, y, '#27ae60')
      const paidRows = paidBills.map(b => [
        b.providerName,
        b.accountNumber || '—',
        b.property?.name || b.buildingName || '-',
        `AED ${safeNumber(b.totalAmountDue).toFixed(2)}`,
        b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '-',
        b.payments?.[0]?.reference || '-',
      ])
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Amount', widthPct: 15 },
        { header: 'Payment Date', widthPct: 12.5 },
        { header: 'Reference', widthPct: 12.5 },
      ], paidRows, y)
    }

    // Partially Paid Bills Section
    if (partiallyPaidBills.length > 0) {
      y = addSectionTitle(`Partially Paid Bills (${partiallyPaidBills.length})`, y, '#8e44ad')
      const partialRows = partiallyPaidBills.map(b => {
        const totalDue = safeNumber(b.totalAmountDue)
        const outstanding = safeNumber(b.currentOutstanding)
        const paid = totalDue - outstanding
        return [
          b.providerName,
          b.accountNumber || '—',
          `AED ${totalDue.toFixed(2)}`,
          `AED ${paid.toFixed(2)}`,
          `AED ${outstanding.toFixed(2)}`,
          new Date(b.nextDueDate).toISOString().split('T')[0],
        ]
      })
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Original Amt', widthPct: 15 },
        { header: 'Paid', widthPct: 15 },
        { header: 'Remaining', widthPct: 15 },
        { header: 'Due Date', widthPct: 15 },
      ], partialRows, y)
    }

    // Outstanding Balance Summary
    if (outstandingBills.length > 0) {
      y = addSectionTitle(`Outstanding Balances (${outstandingBills.length})`, y, '#c0392b')
      const outstandingRows = outstandingBills.map(b => [
        b.providerName,
        b.accountNumber || '—',
        b.property?.name || b.buildingName || '-',
        `AED ${safeNumber(b.previousOutstanding).toFixed(2)}`,
        `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
        b.serviceType,
      ])
      y = drawTable([
        { header: 'Provider', widthPct: 25 },
        { header: 'Account#', widthPct: 15 },
        { header: 'Property', widthPct: 20 },
        { header: 'Previous Bal', widthPct: 15 },
        { header: 'Current Bal', widthPct: 12.5 },
        { header: 'Type', widthPct: 12.5 },
      ], outstandingRows, y)

      // Total liability
      const totalPrev = outstandingBills.reduce((s, b) => s + safeNumber(b.previousOutstanding), 0)
      const totalCurr = outstandingBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)

      if (y + 25 > doc.page.height - 60) {
        addFooter()
        doc.addPage()
        y = 50
      }

      doc.fontSize(10).fillColor('#c0392b').font('Helvetica-Bold')
      doc.text(`Total Liability: AED ${totalCurr.toFixed(2)} (Previous: AED ${totalPrev.toFixed(2)})`, marginLeft, y, { width: pageWidth })
      y += 20
    }

    // Add footer to last page
    addFooter()

    doc.end()

    // Wait for PDF to finish
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
