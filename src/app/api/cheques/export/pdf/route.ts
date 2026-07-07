import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'
import PDFDocument from 'pdfkit'

// GET /api/cheques/export/pdf — generate professional PDF report
// Shows UPCCOMING (pending) cheques organized by month, one month per page.
// Each page shows: month title, total amount, table of cheques for that month.
// Does NOT include paid cheques (those are in the XLSX export only).

interface ChequeRow {
  id: string
  propertyId: string
  payeeName: string
  payeeMobile: string | null
  amount: number
  dueDate: Date
  chequeNumber: string | null
  bankName: string | null
  status: string
  notes: string | null
  property: { id: string; name: string }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) {
      return errorResponse('Only financial users can export reports', 403)
    }

    // Fetch all PENDING cheques (upcoming — not yet paid)
    const cheques = await prisma.cheque.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        status: 'pending',
      },
      include: {
        property: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    if (cheques.length === 0) {
      return errorResponse('No pending cheques to export', 404)
    }

    const company = await prisma.company.findUnique({ where: { id: user.companyId } })
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // ─── Group cheques by month (YYYY-MM) ───
    const byMonth = new Map<string, ChequeRow[]>()
    for (const c of cheques) {
      const d = new Date(c.dueDate)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, [])
      byMonth.get(monthKey)!.push(c as any)
    }

    // Sort months chronologically
    const sortedMonths = Array.from(byMonth.keys()).sort()

    // ─── Colors ───
    const COLORS = {
      primary: '#0F3D5C',
      accent: '#0E7C5A',
      warning: '#C75B12',
      danger: '#A02B1F',
      textDark: '#1F2937',
      textBody: '#374151',
      textMuted: '#6B7280',
      bgLight: '#F3F4F6',
      bgZebra: '#F9FAFB',
      border: '#D1D5DB',
      borderLight: '#E5E7EB',
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    // ─── Generate PDF ───
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: 'Upcoming Cheques Report',
        Author: company?.name || 'Al Reef Al Madeena',
        Subject: 'Pending Cheques by Month',
        CreationDate: now,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const marginLeft = 50
    const marginRight = 50
    const pageWidth = doc.page.width - marginLeft - marginRight
    const pageHeight = doc.page.height
    const contentBottomLimit = pageHeight - 60

    // ─── Helper: truncate text ───
    const truncate = (text: string, maxWidth: number, font: string, size: number): string => {
      doc.font(font).fontSize(size)
      if (doc.widthOfString(text) <= maxWidth) return text
      let t = text
      while (t.length > 0 && doc.widthOfString(t + '…') > maxWidth) t = t.slice(0, -1)
      return t + '…'
    }

    // ─── Helper: format AED ───
    const formatAED = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE')

    // ═══════════════════════════════════════════════════════════════════════
    // COVER PAGE — Summary of all months
    // ═══════════════════════════════════════════════════════════════════════
    let y = 50

    // Top accent bar
    doc.rect(0, 0, doc.page.width, 6).fillColor(COLORS.accent).fill()

    // Company name
    doc.fontSize(20).fillColor(COLORS.primary).font('Helvetica-Bold')
    const companyName = company?.name || 'Al Reef Al Madeena'
    doc.text(companyName, marginLeft, y, { width: pageWidth, lineBreak: true })
    y += doc.heightOfString(companyName, { width: pageWidth, fontSize: 20 }) + 6

    // Report title
    doc.fontSize(14).fillColor(COLORS.textDark).font('Helvetica-Bold')
    doc.text('Upcoming Cheques Report — by Month', marginLeft, y, { width: pageWidth })
    y += 18

    // Generated date
    doc.fontSize(9).fillColor(COLORS.textMuted).font('Helvetica')
    doc.text(`Generated: ${today}  |  ${cheques.length} pending cheques across ${sortedMonths.length} months`, marginLeft, y, { width: pageWidth })
    y += 14

    // Separator
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(2).stroke()
    y += 16

    // Summary table
    doc.fontSize(10).fillColor(COLORS.textDark).font('Helvetica-Bold')
    doc.text('MONTH', marginLeft, y, { width: 200 })
    doc.text('CHEQUES', marginLeft + 220, y, { width: 80, align: 'center' })
    doc.text('TOTAL AMOUNT', marginLeft + pageWidth - 120, y, { width: 120, align: 'right' })
    y += 16
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.border).lineWidth(0.5).stroke()
    y += 8

    let grandTotal = 0
    let grandCount = 0

    for (let i = 0; i < sortedMonths.length; i++) {
      const monthKey = sortedMonths[i]
      const monthCheques = byMonth.get(monthKey)!
      const [year, month] = monthKey.split('-').map(Number)
      const monthLabel = `${monthNames[month - 1]} ${year}`
      const monthTotal = monthCheques.reduce((s, c) => s + safeNumber(c.amount), 0)
      const zebra = i % 2 === 1

      if (zebra) {
        doc.rect(marginLeft, y - 4, pageWidth, 22).fillColor(COLORS.bgZebra).fill()
      }

      doc.fontSize(10).fillColor(COLORS.textDark)
      doc.font('Helvetica-Bold').text(monthLabel, marginLeft, y, { width: 200 })
      doc.font('Helvetica').fillColor(COLORS.textBody)
      doc.text(String(monthCheques.length), marginLeft + 220, y, { width: 80, align: 'center' })
      doc.font('Helvetica-Bold').fillColor(COLORS.accent)
      doc.text(formatAED(monthTotal), marginLeft + pageWidth - 120, y, { width: 120, align: 'right' })

      y += 22
      grandTotal += monthTotal
      grandCount += monthCheques.length
    }

    // Grand total
    y += 4
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(1).stroke()
    y += 8
    doc.rect(marginLeft, y, pageWidth, 28).fillColor(COLORS.primary).fill()
    doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold')
    doc.text('GRAND TOTAL', marginLeft, y + 8, { width: 200 })
    doc.text(`${grandCount} cheques`, marginLeft + 220, y + 8, { width: 80, align: 'center' })
    doc.text(formatAED(grandTotal), marginLeft + pageWidth - 120, y + 8, { width: 120, align: 'right' })

    // ═══════════════════════════════════════════════════════════════════════
    // ONE PAGE PER MONTH
    // ═══════════════════════════════════════════════════════════════════════
    for (const monthKey of sortedMonths) {
      const monthCheques = byMonth.get(monthKey)!
      const [year, month] = monthKey.split('-').map(Number)
      const monthLabel = `${monthNames[month - 1]} ${year}`
      const monthTotal = monthCheques.reduce((s, c) => s + safeNumber(c.amount), 0)

      // Start a new page for each month
      doc.addPage()

      // Top accent bar
      doc.rect(0, 0, doc.page.width, 6).fillColor(COLORS.accent).fill()

      y = 50

      // Company name (smaller on month pages)
      doc.fontSize(14).fillColor(COLORS.primary).font('Helvetica-Bold')
      doc.text(companyName, marginLeft, y, { width: pageWidth })
      y += 20

      // Month title — large
      doc.fontSize(22).fillColor(COLORS.textDark).font('Helvetica-Bold')
      doc.text(monthLabel, marginLeft, y, { width: pageWidth })
      y += 30

      // Summary line
      doc.fontSize(10).fillColor(COLORS.textMuted).font('Helvetica')
      doc.text(`${monthCheques.length} pending cheques  |  Total: `, marginLeft, y, { width: pageWidth - 120, continued: true })
      doc.font('Helvetica-Bold').fillColor(COLORS.accent)
      doc.text(formatAED(monthTotal), { width: 120, align: 'right' })
      y += 16

      // Separator
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(1.5).stroke()
      y += 16

      // Table header
      const colWidths = {
        date: 70,
        property: 140,
        payee: 150,
        amount: 90,
        chequeNum: 80,
      }
      const colX = {
        date: marginLeft,
        property: marginLeft + colWidths.date,
        payee: marginLeft + colWidths.date + colWidths.property,
        amount: marginLeft + colWidths.date + colWidths.property + colWidths.payee,
        chequeNum: marginLeft + colWidths.date + colWidths.property + colWidths.payee + colWidths.amount,
      }
      // Adjust to fit page width
      const totalColWidth = colWidths.date + colWidths.property + colWidths.payee + colWidths.amount + colWidths.chequeNum
      const scale = pageWidth / totalColWidth
      for (const k of Object.keys(colWidths)) (colWidths as any)[k] *= scale
      colX.property = marginLeft + colWidths.date
      colX.payee = colX.property + colWidths.property
      colX.amount = colX.payee + colWidths.payee
      colX.chequeNum = colX.amount + colWidths.amount

      // Header row
      doc.rect(marginLeft, y, pageWidth, 24).fillColor(COLORS.primary).fill()
      doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('DUE DATE', colX.date + 6, y + 7, { width: colWidths.date - 6 })
      doc.text('PROPERTY', colX.property + 4, y + 7, { width: colWidths.property - 4 })
      doc.text('PAYEE', colX.payee + 4, y + 7, { width: colWidths.payee - 4 })
      doc.text('AMOUNT', colX.amount + 4, y + 7, { width: colWidths.amount - 8, align: 'right' })
      doc.text('CHEQUE #', colX.chequeNum + 4, y + 7, { width: colWidths.chequeNum - 4 })
      y += 24

      // Data rows
      for (let i = 0; i < monthCheques.length; i++) {
        const c = monthCheques[i]
        const zebra = i % 2 === 1
        const rowHeight = 22

        // Check for page break
        if (y + rowHeight > contentBottomLimit) {
          doc.addPage()
          y = 50
          // Repeat header
          doc.rect(marginLeft, y, pageWidth, 24).fillColor(COLORS.primary).fill()
          doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
          doc.text('DUE DATE', colX.date + 6, y + 7, { width: colWidths.date - 6 })
          doc.text('PROPERTY', colX.property + 4, y + 7, { width: colWidths.property - 4 })
          doc.text('PAYEE', colX.payee + 4, y + 7, { width: colWidths.payee - 4 })
          doc.text('AMOUNT', colX.amount + 4, y + 7, { width: colWidths.amount - 8, align: 'right' })
          doc.text('CHEQUE #', colX.chequeNum + 4, y + 7, { width: colWidths.chequeNum - 4 })
          y += 24
        }

        // Zebra background
        if (zebra) {
          doc.rect(marginLeft, y, pageWidth, rowHeight).fillColor(COLORS.bgZebra).fill()
        }

        // Bottom border
        doc.moveTo(marginLeft, y + rowHeight).lineTo(marginLeft + pageWidth, y + rowHeight)
          .strokeColor(COLORS.borderLight).lineWidth(0.3).stroke()

        const dueDate = new Date(c.dueDate).toISOString().slice(0, 10)
        const propName = truncate(c.property.name, colWidths.property - 8, 'Helvetica', 9)
        const payeeName = truncate(c.payeeName, colWidths.payee - 8, 'Helvetica', 9)
        const amount = formatAED(safeNumber(c.amount))
        const chequeNum = c.chequeNumber || '—'

        doc.fontSize(9).fillColor(COLORS.textBody).font('Helvetica')
        doc.text(dueDate, colX.date + 6, y + 6, { width: colWidths.date - 6 })
        doc.font('Helvetica-Bold').fillColor(COLORS.textDark)
        doc.text(propName, colX.property + 4, y + 6, { width: colWidths.property - 4 })
        doc.font('Helvetica').fillColor(COLORS.textBody)
        doc.text(payeeName, colX.payee + 4, y + 6, { width: colWidths.payee - 4 })
        doc.font('Helvetica-Bold').fillColor(COLORS.accent)
        doc.text(amount, colX.amount + 4, y + 6, { width: colWidths.amount - 8, align: 'right' })
        doc.font('Helvetica').fillColor(COLORS.textMuted)
        doc.text(chequeNum, colX.chequeNum + 4, y + 6, { width: colWidths.chequeNum - 4 })

        y += rowHeight
      }

      // Month total bar at bottom of the month's data
      y += 4
      if (y + 28 > contentBottomLimit) {
        doc.addPage()
        y = 50
      }
      doc.rect(marginLeft, y, pageWidth, 26).fillColor(COLORS.accent).fill()
      doc.fontSize(11).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text(`${monthLabel} — TOTAL`, marginLeft + 8, y + 7, { width: pageWidth - 160 })
      doc.text(formatAED(monthTotal), marginLeft + pageWidth - 120, y + 7, { width: 112, align: 'right' })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER on every page
    // ═══════════════════════════════════════════════════════════════════════
    const range = doc.bufferedPageRange()
    const totalPages = range.start + range.count
    for (let i = range.start; i < totalPages; i++) {
      doc.switchToPage(i)
      doc.moveTo(marginLeft, pageHeight - 35).lineTo(marginLeft + pageWidth, pageHeight - 35)
        .strokeColor(COLORS.borderLight).lineWidth(0.3).stroke()
      doc.fontSize(7).fillColor(COLORS.textMuted).font('Helvetica')
      doc.text(`${company?.name || 'Al Reef Al Madeena'} — Upcoming Cheques Report`, marginLeft, pageHeight - 25, { width: pageWidth / 2 - 10, align: 'left' })
      doc.text(`Page ${i + 1} of ${totalPages}`, marginLeft + pageWidth / 2, pageHeight - 25, { width: pageWidth / 2 - 10, align: 'right' })
    }

    // ─── Finalize ───
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.end()
    })

    const filename = `Upcoming_Cheques_Report_${today}.pdf`

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error: any) {
    console.error('[CHEQUES_PDF] Error:', error)
    return errorResponse(`Failed to generate PDF: ${error.message}`, 500)
  }
}
