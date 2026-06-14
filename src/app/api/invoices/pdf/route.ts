import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
} from '@/lib/api-utils'
import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'

// GET /api/invoices/pdf?tenantId=...&month=...&year=...&includeMuniFee=...
// Server-side PDF generation with embedded fonts for device-independent output
export async function GET(request: Request) {
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const month = parseInt(searchParams.get('month') || '0', 10)
    const year = parseInt(searchParams.get('year') || '0', 10)
    const includeMuniFee = searchParams.get('includeMuniFee') === 'true'

    if (!tenantId || !month || !year) {
      return errorResponse('tenantId, month, and year are required', 400)
    }

    if (month < 1 || month > 12) {
      return errorResponse('Invalid month', 400)
    }

    // Fetch tenant with property and company
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, companyId: user.companyId, deletedAt: null },
      include: {
        property: true,
      },
    })

    if (!tenant) return errorResponse('Tenant not found', 404)

    // Fetch payments for this tenant/month/year
    // CRITICAL: Exclude HISTORICAL_DEBT payments from paidAmount because those payments
    // are already reflected in the reduced tenant.openingBalance. Including them would
    // double-count the payment (once via reduced openingBalance, once via paymentsReceived).
    const payments = await prisma.payment.findMany({
      where: {
        tenantId: tenant.id,
        month,
        year,
        allocationType: { not: 'HISTORICAL_DEBT' },
      },
      orderBy: { date: 'desc' },
    })

    const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const rentAmount = Number(tenant.rentAmount)
    const openingBalance = Number(tenant.openingBalance) || 0
    const creditBalance = Number(tenant.creditBalance) || 0
    const muniFee = includeMuniFee ? Math.round(rentAmount * 0.05) : 0
    const currentCharges = rentAmount + muniFee
    const totalDue = openingBalance + currentCharges - creditBalance
    const remaining = totalDue - paidAmount

    const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${tenant.unitNumber || '000'}`
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const invoiceDate = new Date()
    const dueDate = new Date(year, month - 1, 5)

    // Payment status
    let paymentStatus = 'UNPAID'
    let statusColor = '#EA580C'
    if (paidAmount >= totalDue) {
      paymentStatus = 'PAID'
      statusColor = '#0D7C3D'
    } else if (paidAmount > 0) {
      paymentStatus = 'PARTIAL'
      statusColor = '#D97706'
    } else {
      const now = new Date()
      if (now > dueDate) {
        paymentStatus = 'OVERDUE'
        statusColor = '#DC2626'
      } else {
        paymentStatus = 'DUE SOON'
        statusColor = '#CA8A04'
      }
    }

    // ── Load embedded fonts ──
    const fontsDir = path.join(process.cwd(), 'public', 'fonts')
    const notoSansRegular = path.join(fontsDir, 'NotoSans-Regular.ttf')
    const notoSansBold = path.join(fontsDir, 'NotoSans-Bold.ttf')
    const notoSansArabicRegular = path.join(fontsDir, 'NotoSansArabic-Regular.ttf')
    const notoSansArabicBold = path.join(fontsDir, 'NotoSansArabic-Bold.ttf')

    // Verify fonts exist (fallback to default if not available)
    const hasNotoSans = fs.existsSync(notoSansRegular) && fs.existsSync(notoSansBold)
    const hasNotoArabic = fs.existsSync(notoSansArabicRegular) && fs.existsSync(notoSansArabicBold)

    // Create PDF document
    // Note: bufferPages removed — it is unnecessary for single-page invoices and can
    // interact badly with auto-page-breaking when footer text wraps near the page bottom.
    // We set bottom margin to 0 immediately to prevent PDFKit's auto-page-break
    // from adding unwanted blank pages. All element positions are manually controlled.
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    doc.page.margins.bottom = 0  // Prevent auto-page-break for entire document
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    // ── Register fonts ──
    if (hasNotoSans) {
      doc.registerFont('NotoSans', notoSansRegular)
      doc.registerFont('NotoSans-Bold', notoSansBold)
    }
    if (hasNotoArabic) {
      doc.registerFont('NotoSansArabic', notoSansArabicRegular)
      doc.registerFont('NotoSansArabic-Bold', notoSansArabicBold)
    }

    // Font helpers - switch between Latin and Arabic fonts
    const latinFont = hasNotoSans ? 'NotoSans' : 'Helvetica'
    const latinFontBold = hasNotoSans ? 'NotoSans-Bold' : 'Helvetica-Bold'
    const arabicFont = hasNotoArabic ? 'NotoSansArabic' : 'Helvetica'
    const arabicFontBold = hasNotoArabic ? 'NotoSansArabic-Bold' : 'Helvetica-Bold'

    function hasArabic(text: string | null | undefined): boolean {
      if (!text) return false
      // Check for Arabic Unicode range (including Presentation Forms)
      return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
    }

    function drawText(text: string, x: number, y: number, options?: { width?: number; align?: string; bold?: boolean }) {
      const font = hasArabic(text)
        ? (options?.bold ? arabicFontBold : arabicFont)
        : (options?.bold ? latinFontBold : latinFont)
      const features = hasArabic(text) ? ['rtla'] : undefined
      doc.font(font)
      if (features && options) {
        doc.text(text, x, y, { ...options, features } as any)
      } else {
        doc.text(text, x, y, options as any)
      }
    }

    // ── Colors ──
    const emerald = '#0D7C3D'
    const emeraldLight = '#ECFDF5'
    const gray = '#6B7280'
    const lightGray = '#F9FAFB'
    const darkText = '#111827'
    const medText = '#374151'
    const pageWidth = doc.page.width

    // ═══════════════════════════════════════════════════════════
    // HEADER SECTION
    // ═══════════════════════════════════════════════════════════
    let y = 50

    // Company logo area (green square with "AM" initials)
    doc.save()
    doc.roundedRect(50, y, 36, 36, 4).fill(emerald)
    doc.fontSize(16).fillColor('#FFFFFF').font(latinFontBold)
    doc.text('AM', 50, y + 8, { width: 36, align: 'center' })
    doc.restore()

    // Company name
    doc.fontSize(16).fillColor(emerald).font(latinFontBold)
    doc.text('Al Reef Al Madeena', 95, y + 2)
    doc.fontSize(8).fillColor(gray).font(latinFont)
    doc.text('Real Estate Management and General Maintenance - L.L.C - S.P.C', 95, y + 22)

    // Company details
    doc.fontSize(7).fillColor(gray).font(latinFont)
    doc.text("Near LuLu Muraba'a, Al Ain City, Abu Dhabi, UAE", 95, y + 34)
    doc.text('Tel: +971504225590 / +971568452161 | Email: alreef.junoobi@gmail.com', 95, y + 44)
    doc.text('Tax ID: 105383159800003 | Commercial License: CN-6177648', 95, y + 54)

    // Invoice title (right side)
    doc.fontSize(20).fillColor(emerald).font(latinFontBold)
    doc.text('INVOICE', pageWidth - 50, y + 2, { width: 160, align: 'right' })

    // Invoice details (right side)
    doc.fontSize(8).fillColor(medText).font(latinFont)
    doc.text(`Invoice Number: ${invoiceNumber}`, pageWidth - 200, y + 28, { width: 150, align: 'right' })
    doc.text(`Invoice Date: ${formatDateISO(invoiceDate)}`, pageWidth - 200, y + 40, { width: 150, align: 'right' })
    doc.text(`Due Date: ${formatDateISO(dueDate)}`, pageWidth - 200, y + 52, { width: 150, align: 'right' })

    // Header divider
    y += 68
    doc.moveTo(50, y).lineTo(pageWidth - 50, y).strokeColor(emerald).lineWidth(2).stroke()
    y += 15

    // ═══════════════════════════════════════════════════════════
    // BILL TO SECTION
    // ═══════════════════════════════════════════════════════════
    const billToBoxY = y
    doc.roundedRect(50, billToBoxY, pageWidth - 100, 60, 4).fill(lightGray)

    // "Bill To" label
    doc.fontSize(9).fillColor(emerald).font(latinFontBold)
    doc.text('BILL TO', 62, billToBoxY + 8)

    // Tenant name (English)
    doc.fontSize(11).fillColor(darkText).font(latinFontBold)
    doc.text(tenant.name, 62, billToBoxY + 22)

    // Arabic name (if available) - right side of Bill To box
    if (tenant.nameAr && hasNotoArabic) {
      doc.fontSize(10).fillColor(gray).font(arabicFont)
      doc.text(tenant.nameAr, pageWidth - 220, billToBoxY + 10, { width: 160, align: 'right', features: ['rtla'] } as any)
    }

    // Property and unit info (right side)
    doc.fontSize(8).fillColor(medText).font(latinFont)
    doc.text(tenant.property?.name || '', pageWidth - 220, billToBoxY + 28, { width: 160, align: 'right' })
    doc.text(`Unit Number: ${tenant.unitNumber || '-'}`, pageWidth - 220, billToBoxY + 40, { width: 160, align: 'right' })

    // Contact details (left side, below name)
    doc.fontSize(8).fillColor(gray).font(latinFont)
    if (tenant.phone) {
      doc.text(`Phone: ${tenant.phone}`, 62, billToBoxY + 36)
    }
    if (tenant.emiratesId) {
      doc.text(`Emirates ID: ${tenant.emiratesId}`, 62, billToBoxY + 48)
    }

    y = billToBoxY + 70

    // ═══════════════════════════════════════════════════════════
    // INVOICE TABLE
    // ═══════════════════════════════════════════════════════════
    const tableX = 50
    const tableWidth = pageWidth - 100

    // Table header
    doc.rect(tableX, y, tableWidth, 22).fill(emerald)
    doc.fontSize(9).fillColor('#FFFFFF').font(latinFontBold)
    doc.text('#', tableX + 10, y + 6, { width: 20 })
    doc.text('Description', tableX + 35, y + 6, { width: 250 })
    doc.text('Amount (AED)', tableX + tableWidth - 120, y + 6, { width: 110, align: 'right' })
    y += 22

    // Row 1: Monthly Rent
    let itemNum = 1
    const rowHeight = 30

    doc.rect(tableX, y, tableWidth, rowHeight).fill('#FFFFFF')
    doc.fontSize(9).fillColor(gray).font(latinFont)
    doc.text(String(itemNum), tableX + 10, y + 8, { width: 20 })
    doc.fontSize(9).fillColor(darkText).font(latinFontBold)
    doc.text(`Monthly Rent — ${monthNames[month - 1]} ${year}`, tableX + 35, y + 6, { width: 250 })
    doc.fontSize(7).fillColor(gray).font(latinFont)
    doc.text(`${tenant.property?.name || ''} — Unit: ${tenant.unitNumber || '-'}`, tableX + 35, y + 19, { width: 250 })
    doc.fontSize(10).fillColor(darkText).font(latinFont)
    doc.text(formatAED(rentAmount), tableX + tableWidth - 120, y + 8, { width: 110, align: 'right' })
    y += rowHeight
    itemNum++

    // Row 2: Municipality Fee (if included)
    if (includeMuniFee) {
      doc.rect(tableX, y, tableWidth, rowHeight).fill(lightGray)
      doc.fontSize(9).fillColor(gray).font(latinFont)
      doc.text(String(itemNum), tableX + 10, y + 8, { width: 20 })
      doc.fontSize(9).fillColor(darkText).font(latinFontBold)
      doc.text('Municipality Fee', tableX + 35, y + 6, { width: 250 })
      doc.fontSize(7).fillColor(gray).font(latinFont)
      doc.text(`5% of ${formatAED(rentAmount)}`, tableX + 35, y + 19, { width: 250 })
      doc.fontSize(10).fillColor(darkText).font(latinFont)
      doc.text(formatAED(muniFee), tableX + tableWidth - 120, y + 8, { width: 110, align: 'right' })
      y += rowHeight
    }

    // ═══════════════════════════════════════════════════════════
    // TOTALS SECTION
    // ═══════════════════════════════════════════════════════════
    y += 10
    const totalsX = tableX + tableWidth * 0.5
    const totalsWidth = tableWidth * 0.5

    // Opening Balance
    if (openingBalance > 0) {
      doc.fontSize(9).fillColor('#92400E').font(latinFont)
      doc.text('Opening Balance', totalsX, y, { width: totalsWidth - 20, align: 'left' })
      doc.text(formatAED(openingBalance), totalsX, y, { width: totalsWidth, align: 'right' })
      y += 16
    }

    // Current Charges
    doc.fontSize(9).fillColor(gray).font(latinFont)
    doc.text('Current Charges', totalsX, y, { width: totalsWidth - 20, align: 'left' })
    doc.text(formatAED(currentCharges), totalsX, y, { width: totalsWidth, align: 'right' })
    y += 16

    // Credit Balance
    if (creditBalance > 0) {
      doc.fontSize(9).fillColor(emerald).font(latinFont)
      doc.text('Credit Balance', totalsX, y, { width: totalsWidth - 20, align: 'left' })
      doc.text(`(${formatAED(creditBalance)})`, totalsX, y, { width: totalsWidth, align: 'right' })
      y += 16
    }

    // Total Due line
    doc.moveTo(totalsX, y).lineTo(totalsX + totalsWidth, y).strokeColor(emerald).lineWidth(1.5).stroke()
    y += 6

    doc.fontSize(11).fillColor(emerald).font(latinFontBold)
    doc.text('Total Due', totalsX, y, { width: totalsWidth - 20, align: 'left' })
    doc.text(formatAED(Math.max(0, totalDue)), totalsX, y, { width: totalsWidth, align: 'right' })
    y += 18

    // Payments Received
    if (paidAmount > 0) {
      doc.fontSize(9).fillColor(emerald).font(latinFont)
      doc.text('Payments Received', totalsX, y, { width: totalsWidth - 20, align: 'left' })
      doc.text(`-${formatAED(paidAmount)}`, totalsX, y, { width: totalsWidth, align: 'right' })
      y += 16

      doc.moveTo(totalsX, y).lineTo(totalsX + totalsWidth, y).strokeColor('#D1D5DB').lineWidth(0.5).stroke()
      y += 6

      doc.fontSize(10).fillColor('#DC2626').font(latinFontBold)
      doc.text('Remaining Balance', totalsX, y, { width: totalsWidth - 20, align: 'left' })
      doc.text(formatAED(Math.max(0, remaining)), totalsX, y, { width: totalsWidth, align: 'right' })
      y += 18
    }

    // ═══════════════════════════════════════════════════════════
    // PAYMENT STATUS SECTION
    // ═══════════════════════════════════════════════════════════
    y += 5
    const statusBoxY = y
    doc.roundedRect(50, statusBoxY, pageWidth - 100, 28, 4).fill(lightGray)

    doc.fontSize(8).fillColor(gray).font(latinFont)
    doc.text('Payment Status', 62, statusBoxY + 4)

    doc.fontSize(12).fillColor(statusColor).font(latinFontBold)
    doc.text(paymentStatus, 62, statusBoxY + 14)

    // Lease info (right side)
    if (tenant.leaseStart || tenant.leaseEnd) {
      doc.fontSize(7).fillColor(gray).font(latinFont)
      const leaseStart = tenant.leaseStart ? formatDateISO(new Date(tenant.leaseStart)) : '-'
      const leaseEnd = tenant.leaseEnd ? formatDateISO(new Date(tenant.leaseEnd)) : '-'
      doc.text(`Lease Start: ${leaseStart}  |  Lease End: ${leaseEnd}`, pageWidth - 250, statusBoxY + 10, { width: 200, align: 'right' })
    }

    y = statusBoxY + 40

    // ═══════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════
    // Bottom margin was already set to 0 at document creation to prevent
    // PDFKit's auto-page-break from adding unwanted blank pages.
    const footerY = doc.page.height - 60

    doc.moveTo(50, footerY).lineTo(pageWidth - 50, footerY).strokeColor('#E5E7EB').lineWidth(0.5).stroke()

    doc.fontSize(7).fillColor('#9CA3AF').font(latinFont)
    doc.text(
      "Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C | Near LuLu Muraba'a, Al Ain City, Abu Dhabi, UAE",
      50, footerY + 8, { width: pageWidth - 100, align: 'center' }
    )
    doc.text(
      'Thank you for your payment. For questions, contact alreef.junoobi@gmail.com or +971504225590',
      50, footerY + 20, { width: pageWidth - 100, align: 'center' }
    )

    // ── Finalize PDF ──
    doc.end()

    const pdfBuffer = await pdfPromise

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Error generating invoice PDF:', error)
    return errorResponse('Failed to generate invoice PDF', 500)
  }
}

// ── Helper functions ──

function formatDateISO(date: Date): string {
  const day = date.getDate()
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

function formatAED(amount: number): string {
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + ' AED'
}
