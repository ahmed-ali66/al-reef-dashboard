import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
  serialize,
} from '@/lib/api-utils'
import PDFDocument from 'pdfkit'

// GET /api/cheques/export/pdf — generate professional PDF report
// Optional query params: status, propertyId, search
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

    const [cheques, company, paymentsAgg] = await Promise.all([
      prisma.cheque.findMany({
        where,
        include: {
          property: { select: { id: true, name: true, nameAr: true, type: true } },
          payments: {
            orderBy: { paymentDate: 'desc' },
            select: { id: true, amount: true, paymentDate: true, paymentMethod: true, reference: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }],
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true, nameAr: true, phone: true, email: true, address: true },
      }),
      // Total payments across all cheques (for summary)
      prisma.chequePayment.aggregate({
        where: { companyId: user.companyId },
        _sum: { amount: true },
        _count: true,
      }),
    ])

    if (cheques.length === 0) {
      return errorResponse('No cheques to export', 404)
    }

    // Serialize + compute paid-so-far/remaining per cheque
    const serializedCheques = cheques.map(c => {
      const s = serialize(c)
      const totalPaid = (c.payments || []).reduce((sum, p) => sum + safeNumber(p.amount), 0)
      const chequeAmount = safeNumber(c.amount)
      s.totalPaid = Number(totalPaid.toFixed(2))
      s.remaining = Number(Math.max(0, chequeAmount - totalPaid).toFixed(2))
      return s
    })

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // ─── Classification (3 mutually-exclusive buckets + overdue callout) ───
    const hasPayments = (c: any) => (c.payments?.length || 0) > 0 || safeNumber(c.totalPaid) > 0
    const isOverdue = (c: any) => {
      const dueDate = new Date(c.dueDate)
      const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
      return dueDay < startOfToday && c.status !== 'paid'
    }

    const fullyPaidCheques = serializedCheques.filter(c => c.status === 'paid')
    const partiallyPaidCheques = serializedCheques.filter(c => c.status === 'partially_paid')
    const unpaidCheques = serializedCheques.filter(c => c.status === 'pending' || c.status === 'bounced' || c.status === 'cancelled')
    const overdueUnpaidCount = unpaidCheques.filter(isOverdue).length

    // ─── Generate PDF ───
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 0, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: 'Cheques Report',
        Author: company?.name || 'Al Reef Al Madeena',
        Subject: 'Outgoing Cheques Report',
        CreationDate: now,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const marginLeft = 50
    const pageWidth = doc.page.width - marginLeft - 50
    const contentBottomLimit = doc.page.height - 55

    const truncateText = (text: string, maxWidth: number, fontName: string, fontSize: number): string => {
      doc.font(fontName).fontSize(fontSize)
      if (doc.widthOfString(text) <= maxWidth) return text
      let truncated = text
      while (truncated.length > 0 && doc.widthOfString(truncated + '...') > maxWidth) {
        truncated = truncated.slice(0, -1)
      }
      return truncated + '...'
    }

    const addHeader = (): number => {
      let y = marginLeft
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
      const companyName = company?.name || 'Al Reef Al Madeena'
      doc.text(companyName, marginLeft, y, { width: pageWidth, lineBreak: true })
      y += doc.heightOfString(companyName, { width: pageWidth, fontSize: 18 }) + 10

      doc.fontSize(14).fillColor('#2c3e50').font('Helvetica')
      doc.text('Cheques Report', marginLeft, y, { width: pageWidth, lineBreak: true })
      y += doc.heightOfString('Cheques Report', { width: pageWidth, fontSize: 14 }) + 8

      const totalCheques = serializedCheques.length
      const totalAmount = serializedCheques.reduce((s, c) => s + safeNumber(c.amount), 0)
      const totalPaid = serializedCheques.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
      const totalRemaining = serializedCheques.reduce((s, c) => s + safeNumber(c.remaining), 0)

      doc.fontSize(9).fillColor('#7f8c8d').font('Helvetica')
      const summaryLine = `Generated: ${today} | Total Cheques: ${totalCheques} | Total Amount: AED ${totalAmount.toFixed(2)} | Paid: AED ${totalPaid.toFixed(2)} | Remaining: AED ${totalRemaining.toFixed(2)}`
      doc.text(summaryLine, marginLeft, y, { width: pageWidth, lineBreak: true })
      y += doc.heightOfString(summaryLine, { width: pageWidth, fontSize: 9 }) + 12

      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor('#1a5276').lineWidth(2).stroke()
      y += 10
      return y
    }

    const addSectionTitle = (title: string, y: number, color: string = '#1a5276'): number => {
      if (y + 50 > contentBottomLimit) { doc.addPage(); y = 50 }
      doc.fontSize(12).fillColor(color).font('Helvetica-Bold')
      doc.text(title, marginLeft, y, { width: pageWidth, lineBreak: true })
      y += doc.heightOfString(title, { width: pageWidth, fontSize: 12 }) + 2
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(color).lineWidth(0.5).stroke()
      y += 8
      return y
    }

    const addSectionTotal = (y: number, label: string, amount: number, color: string, secondaryLabel?: string, secondaryAmount?: number): number => {
      const linesNeeded = secondaryLabel ? 2 : 1
      if (y + 20 * linesNeeded + 10 > contentBottomLimit) { doc.addPage(); y = 50 }
      doc.fontSize(10).fillColor(color).font('Helvetica-Bold')
      doc.text(label, marginLeft, y, { width: pageWidth * 0.7, align: 'left', lineBreak: false })
      doc.text(`AED ${amount.toFixed(2)}`, marginLeft + pageWidth * 0.7, y, { width: pageWidth * 0.3, align: 'right', lineBreak: false })
      y += 18
      if (secondaryLabel && secondaryAmount !== undefined) {
        doc.fontSize(10).fillColor(color).font('Helvetica-Bold')
        doc.text(secondaryLabel, marginLeft, y, { width: pageWidth * 0.7, align: 'left', lineBreak: false })
        doc.text(`AED ${secondaryAmount.toFixed(2)}`, marginLeft + pageWidth * 0.7, y, { width: pageWidth * 0.3, align: 'right', lineBreak: false })
        y += 18
      }
      y += 6
      return y
    }

    type CellValue = string | { primary: string; secondary?: string | null }
    type ColumnSpec = { header: string; widthPct: number }

    const drawTable = (columns: ColumnSpec[], rows: CellValue[][], y: number): number => {
      const colWidths = columns.map(c => (c.widthPct / 100) * pageWidth)
      const padding = 4
      const headerFontSize = 8
      const cellFontSize = 7.5
      const secondaryFontSize = 6.5
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
          doc.text(truncatedHeader, x + padding, startY + 7, { width: colWidths[i] - padding * 2, align: 'left', lineBreak: false })
          x += colWidths[i]
        })
        return startY + headerHeight
      }

      if (y + headerHeight + minRowHeight > contentBottomLimit) { doc.addPage(); y = 50 }
      y = drawHeader(y)

      rows.forEach((row, ri) => {
        let maxCellHeight = minRowHeight
        row.forEach((cell, i) => {
          const cellWidth = colWidths[i] - padding * 2
          if (typeof cell === 'string') {
            doc.font(cellFont).fontSize(cellFontSize)
            const h = doc.heightOfString(String(cell), { width: cellWidth })
            maxCellHeight = Math.max(maxCellHeight, h + 8)
          } else {
            doc.font(cellFont).fontSize(cellFontSize)
            const primaryH = doc.heightOfString(cell.primary, { width: cellWidth })
            let totalH = primaryH
            if (cell.secondary) {
              doc.font(cellFont).fontSize(secondaryFontSize)
              totalH += 2 + doc.heightOfString(cell.secondary, { width: cellWidth })
            }
            maxCellHeight = Math.max(maxCellHeight, totalH + 8)
          }
        })
        maxCellHeight = Math.min(maxCellHeight, 80)

        if (y + maxCellHeight > contentBottomLimit) { doc.addPage(); y = 50; y = drawHeader(y) }
        if (ri % 2 === 0) { doc.rect(marginLeft, y, pageWidth, maxCellHeight).fill('#f8f9fa') }

        let x = marginLeft
        row.forEach((cell, i) => {
          const cellWidth = colWidths[i] - padding * 2
          if (typeof cell === 'string') {
            doc.font(cellFont).fontSize(cellFontSize)
            const wrappedHeight = doc.heightOfString(String(cell), { width: cellWidth })
            if (wrappedHeight <= maxCellHeight - 8) {
              doc.fontSize(cellFontSize).fillColor('#2c3e50').font(cellFont)
              doc.text(String(cell), x + padding, y + 4, { width: cellWidth, align: 'left', lineBreak: true })
            } else {
              const truncated = truncateText(String(cell), cellWidth, cellFont, cellFontSize)
              doc.fontSize(cellFontSize).fillColor('#2c3e50').font(cellFont)
              doc.text(truncated, x + padding, y + 4, { width: cellWidth, align: 'left', lineBreak: false })
            }
          } else {
            doc.font(cellFont).fontSize(cellFontSize).fillColor('#2c3e50')
            doc.text(cell.primary, x + padding, y + 4, { width: cellWidth, align: 'left', lineBreak: true })
            if (cell.secondary) {
              const primaryH = doc.heightOfString(cell.primary, { width: cellWidth, fontSize: cellFontSize })
              doc.font(cellFont).fontSize(secondaryFontSize).fillColor('#7f8c8d')
              doc.text(cell.secondary, x + padding, y + 4 + primaryH + 2, { width: cellWidth, align: 'left', lineBreak: true })
            }
          }
          x += colWidths[i]
        })
        y += maxCellHeight
      })
      return y + 8
    }

    // Build PDF content
    let y = addHeader()

    // Summary Statistics box
    y = addSectionTitle('Summary Statistics', y)
    const totalAmount = serializedCheques.reduce((s, c) => s + safeNumber(c.amount), 0)
    const totalPaid = serializedCheques.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
    const totalRemaining = serializedCheques.reduce((s, c) => s + safeNumber(c.remaining), 0)
    const summaryData: Array<[string, string]> = [
      ['Total Cheques', String(serializedCheques.length)],
      ['Total Amount', `AED ${totalAmount.toFixed(2)}`],
      ['Total Paid', `AED ${totalPaid.toFixed(2)}`],
      ['Total Remaining', `AED ${totalRemaining.toFixed(2)}`],
      ['Fully Paid', String(fullyPaidCheques.length)],
      ['Partially Paid', String(partiallyPaidCheques.length)],
      ['Unpaid', String(unpaidCheques.length)],
      ...(overdueUnpaidCount > 0 ? [['Overdue (subset of Unpaid)', String(overdueUnpaidCount)]] as Array<[string, string]> : []),
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

    // SECTION 1: Fully Paid
    if (fullyPaidCheques.length > 0) {
      y = addSectionTitle(`Fully Paid Cheques (${fullyPaidCheques.length})`, y, '#27ae60')
      const rows = fullyPaidCheques.map(c => [
        c.property?.name || '-',
        { primary: c.payeeName, secondary: c.payeeMobile },
        `AED ${safeNumber(c.amount).toFixed(2)}`,
        `AED ${safeNumber(c.totalPaid).toFixed(2)}`,
        c.paidDate ? new Date(c.paidDate).toISOString().split('T')[0] : '-',
        c.chequeNumber || '-',
      ])
      y = drawTable([
        { header: 'Property', widthPct: 20 },
        { header: 'Payee / Mobile', widthPct: 22 },
        { header: 'Amount', widthPct: 13 },
        { header: 'Paid', widthPct: 13 },
        { header: 'Paid Date', widthPct: 14 },
        { header: 'Cheque #', widthPct: 18 },
      ], rows, y)
      const totalFullyPaid = fullyPaidCheques.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
      y = addSectionTotal(y, `Total Paid (${fullyPaidCheques.length} cheques):`, totalFullyPaid, '#27ae60')
    }

    // SECTION 2: Partially Paid
    if (partiallyPaidCheques.length > 0) {
      y = addSectionTitle(`Partially Paid Cheques (${partiallyPaidCheques.length})`, y, '#8e44ad')
      const rows = partiallyPaidCheques.map(c => [
        c.property?.name || '-',
        { primary: c.payeeName, secondary: c.payeeMobile },
        `AED ${safeNumber(c.amount).toFixed(2)}`,
        `AED ${safeNumber(c.totalPaid).toFixed(2)}`,
        `AED ${safeNumber(c.remaining).toFixed(2)}`,
        new Date(c.dueDate).toISOString().split('T')[0],
      ])
      y = drawTable([
        { header: 'Property', widthPct: 18 },
        { header: 'Payee / Mobile', widthPct: 20 },
        { header: 'Amount', widthPct: 13 },
        { header: 'Paid', widthPct: 13 },
        { header: 'Remaining', widthPct: 13 },
        { header: 'Due Date', widthPct: 23 },
      ], rows, y)
      const totalPartialPaid = partiallyPaidCheques.reduce((s, c) => s + safeNumber(c.totalPaid), 0)
      const totalPartialRemaining = partiallyPaidCheques.reduce((s, c) => s + safeNumber(c.remaining), 0)
      y = addSectionTotal(
        y,
        `Total Paid So Far (${partiallyPaidCheques.length} cheques):`,
        totalPartialPaid,
        '#8e44ad',
        'Total Still Outstanding:',
        totalPartialRemaining,
      )
    }

    // SECTION 3: Unpaid (pending + bounced + cancelled)
    if (unpaidCheques.length > 0) {
      const overdueCallout = overdueUnpaidCount > 0 ? `  ⚠ ${overdueUnpaidCount} overdue` : ''
      y = addSectionTitle(`Unpaid Cheques (${unpaidCheques.length})${overdueCallout}`, y, '#c0392b')
      const rows = unpaidCheques.map(c => [
        c.property?.name || '-',
        { primary: c.payeeName, secondary: c.payeeMobile },
        `AED ${safeNumber(c.amount).toFixed(2)}`,
        new Date(c.dueDate).toISOString().split('T')[0],
        c.status.toUpperCase(),
        c.chequeNumber || '-',
      ])
      y = drawTable([
        { header: 'Property', widthPct: 20 },
        { header: 'Payee / Mobile', widthPct: 22 },
        { header: 'Amount', widthPct: 14 },
        { header: 'Due Date', widthPct: 14 },
        { header: 'Status', widthPct: 14 },
        { header: 'Cheque #', widthPct: 16 },
      ], rows, y)
      const totalUnpaid = unpaidCheques.reduce((s, c) => s + safeNumber(c.amount), 0)
      y = addSectionTotal(y, `Total Outstanding (${unpaidCheques.length} cheques):`, totalUnpaid, '#c0392b')
    }

    // Footers on all pages
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.fontSize(7).fillColor('#95a5a6').font('Helvetica')
      doc.text(
        `Generated by Al Reef Al Madeena Real Estate Management System | ${today} | Confidential`,
        marginLeft,
        doc.page.height - 30,
        { width: pageWidth, align: 'center', lineBreak: false },
      )
    }

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => { resolve(Buffer.concat(chunks)) })
    })

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cheques-report-${today}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generating cheques PDF report:', error)
    return errorResponse('Failed to generate PDF report', 500)
  }
}
