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
        orderBy: { nextDueDate: 'asc' },
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

    // Categorize bills
    const activeBills = bills.filter(b => b.status === 'active')
    const overdueBills = activeBills.filter(b => b.nextDueDate < now)
    const upcomingBills = activeBills.filter(b => b.nextDueDate >= now && b.nextDueDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000))
    const paidBills = activeBills.filter(b => safeNumber(b.currentOutstanding) === 0)
    const partiallyPaidBills = activeBills.filter(b => {
      const outstanding = safeNumber(b.currentOutstanding)
      const totalDue = safeNumber(b.totalAmountDue)
      return outstanding > 0 && outstanding < totalDue
    })
    const outstandingBills = activeBills.filter(b => safeNumber(b.currentOutstanding) > 0)

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

    const pageWidth = doc.page.width - 100 // margins

    // Helper functions
    const addHeader = () => {
      // Company name
      doc.fontSize(18).fillColor('#1a5276').font('Helvetica-Bold')
      doc.text(company?.name || 'Al Reef Al Madeena', 50, 50, { width: pageWidth })
      
      // Report title
      doc.fontSize(14).fillColor('#2c3e50').font('Helvetica')
      doc.text('Recurring Bills & Utilities Report', 50, 75, { width: pageWidth })
      
      // Date and separator
      doc.fontSize(9).fillColor('#7f8c8d')
      doc.text(`Generated: ${today} | Total Bills: ${totalBills} | Outstanding: AED ${totalOutstanding.toFixed(2)}`, 50, 95, { width: pageWidth })
      
      // Separator line
      doc.moveTo(50, 115).lineTo(50 + pageWidth, 115).strokeColor('#1a5276').lineWidth(2).stroke()
      
      return 125
    }

    const addSectionTitle = (title: string, y: number, color: string = '#1a5276') => {
      doc.fontSize(12).fillColor(color).font('Helvetica-Bold')
      doc.text(title, 50, y, { width: pageWidth })
      doc.moveTo(50, y + 16).lineTo(50 + pageWidth, y + 16).strokeColor(color).lineWidth(0.5).stroke()
      return y + 22
    }

    const drawTable = (headers: string[], rows: string[][], y: number): number => {
      const colWidths = headers.map(() => pageWidth / headers.length)
      const rowHeight = 20
      const headerHeight = 24

      if (y + headerHeight + rowHeight * Math.min(rows.length, 3) > doc.page.height - 60) {
        doc.addPage()
        y = 50
      }

      // Header background
      doc.rect(50, y, pageWidth, headerHeight).fill('#1a5276')
      let x = 50
      headers.forEach((h, i) => {
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
        doc.text(h, x + 4, y + 7, { width: colWidths[i] - 8, align: 'left' })
        x += colWidths[i]
      })
      y += headerHeight

      // Rows
      rows.forEach((row, ri) => {
        if (y + rowHeight > doc.page.height - 60) {
          doc.addPage()
          y = 50
          // Re-draw header on new page
          doc.rect(50, y, pageWidth, headerHeight).fill('#1a5276')
          let hx = 50
          headers.forEach((h, i) => {
            doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
            doc.text(h, hx + 4, y + 7, { width: colWidths[i] - 8, align: 'left' })
            hx += colWidths[i]
          })
          y += headerHeight
        }

        // Alternate row background
        if (ri % 2 === 0) {
          doc.rect(50, y, pageWidth, rowHeight).fill('#f8f9fa')
        }

        x = 50
        row.forEach((cell, i) => {
          doc.fontSize(7.5).fillColor('#2c3e50').font('Helvetica')
          doc.text(cell, x + 4, y + 5, { width: colWidths[i] - 8, align: 'left' })
          x += colWidths[i]
        })
        y += rowHeight
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
      const sx = 50 + col * (pageWidth / 2)
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
        const daysOverdue = Math.max(0, Math.ceil((now.getTime() - b.nextDueDate.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.property?.name || b.buildingName || '-',
          `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
          `${daysOverdue} days`,
          b.serviceType,
        ]
      })
      y = drawTable(['Provider', 'Property', 'Outstanding', 'Days Overdue', 'Type'], overdueRows, y)
    }

    // Upcoming Bills Section
    if (upcomingBills.length > 0) {
      y = addSectionTitle(`Upcoming Bills (${upcomingBills.length})`, y, '#e67e22')
      const upcomingRows = upcomingBills.map(b => {
        const daysRemaining = Math.max(0, Math.ceil((b.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        return [
          b.providerName,
          b.property?.name || b.buildingName || '-',
          `AED ${safeNumber(b.totalAmountDue).toFixed(2)}`,
          b.nextDueDate.toISOString().split('T')[0],
          `${daysRemaining} days`,
        ]
      })
      y = drawTable(['Provider', 'Property', 'Amount Due', 'Due Date', 'Remaining'], upcomingRows, y)
    }

    // Paid Bills Section
    if (paidBills.length > 0) {
      y = addSectionTitle(`Paid Bills (${paidBills.length})`, y, '#27ae60')
      const paidRows = paidBills.map(b => [
        b.providerName,
        b.property?.name || b.buildingName || '-',
        `AED ${safeNumber(b.totalAmountDue).toFixed(2)}`,
        b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().split('T')[0] : '-',
        b.payments?.[0]?.reference || '-',
      ])
      y = drawTable(['Provider', 'Property', 'Amount', 'Payment Date', 'Reference'], paidRows, y)
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
          `AED ${totalDue.toFixed(2)}`,
          `AED ${paid.toFixed(2)}`,
          `AED ${outstanding.toFixed(2)}`,
          b.nextDueDate.toISOString().split('T')[0],
        ]
      })
      y = drawTable(['Provider', 'Original Amt', 'Amount Paid', 'Remaining', 'Due Date'], partialRows, y)
    }

    // Outstanding Balance Summary
    if (outstandingBills.length > 0) {
      y = addSectionTitle(`Outstanding Balances (${outstandingBills.length})`, y, '#c0392b')
      const outstandingRows = outstandingBills.map(b => [
        b.providerName,
        b.property?.name || b.buildingName || '-',
        `AED ${safeNumber(b.previousOutstanding).toFixed(2)}`,
        `AED ${safeNumber(b.currentOutstanding).toFixed(2)}`,
        b.serviceType,
      ])
      y = drawTable(['Provider', 'Property', 'Previous Bal', 'Current Bal', 'Type'], outstandingRows, y)

      // Total liability
      const totalPrev = outstandingBills.reduce((s, b) => s + safeNumber(b.previousOutstanding), 0)
      const totalCurr = outstandingBills.reduce((s, b) => s + safeNumber(b.currentOutstanding), 0)
      doc.fontSize(10).fillColor('#c0392b').font('Helvetica-Bold')
      doc.text(`Total Liability: AED ${totalCurr.toFixed(2)} (Previous: AED ${totalPrev.toFixed(2)})`, 50, y, { width: pageWidth })
      y += 20
    }

    // Footer
    const footerY = doc.page.height - 40
    doc.fontSize(7).fillColor('#95a5a6').font('Helvetica')
    doc.text(`Generated by Al Reef Al Madeena Real Estate Management System | ${today} | Confidential`, 50, footerY, {
      width: pageWidth,
      align: 'center',
    })

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
