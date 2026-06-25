import prisma from '@/lib/db'
import {
  getAuthUser,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'
import PDFDocument from 'pdfkit'

// GET /api/properties/vacant-units-pdf — Generate a professional PDF listing all vacant units
// across all properties, with property name, unit type, monthly rent, and annual rent.
//
// Pagination strategy:
//   - Bottom margin is 0 to disable PDFKit's auto page-break (which conflicts with manual control).
//   - All pagination is handled explicitly via ensureSpace().
//   - Every card's full height is pre-calculated BEFORE drawing, so we never split a card.
//   - Text uses `lineBreak: false` for single-line cells; multi-line text is measured first.
//
// Visual design (professional, minimal):
//   - Branded header band (deep blue)
//   - Compact 3-card hero stat block
//   - Summary table of all properties with vacancies (rows never split across pages)
//   - Detailed per-property cards on subsequent pages (each card stays together)
//   - Footer with page numbers on every page

interface VacancyRow {
  propertyName: string
  propertyType: string
  address: string | null
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  vacantUnitTypes: { type: string; count: number; minRent: number; maxRent: number; avgRent: number }[]
  estimatedMonthlyLoss: number
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()
    if (!isFinancialUser(user.role)) {
      return errorResponse('Only financial users can export vacant unit reports', 403)
    }

    const company = await prisma.company.findUnique({ where: { id: user.companyId } })
    if (!company) return errorResponse('Company not found', 404)

    // ─── Fetch all non-archived, non-deleted properties with their tenants ───
    const properties = await prisma.property.findMany({
      where: {
        companyId: user.companyId,
        archived: false,
        deletedAt: null,
      },
      include: {
        tenants: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            unitNumber: true,
            unitType: true,
            rentAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // ─── Build vacancy data per property ───
    const vacancyRows: VacancyRow[] = []

    for (const p of properties) {
      const activeTenants = p.tenants.filter(t => (FINANCIALLY_ACTIVE_STATUSES as readonly string[]).includes(t.status))
      const occupiedCount = activeTenants.length
      const vacantCount = Math.max(0, p.totalUnits - occupiedCount)
      if (vacantCount === 0) continue

      // Group occupied units by unitType to infer pricing
      const byType = new Map<string, number[]>()
      for (const t of activeTenants) {
        const ut = t.unitType || inferUnitTypeFromProperty(p.type)
        if (!byType.has(ut)) byType.set(ut, [])
        byType.get(ut)!.push(safeNumber(t.rentAmount))
      }
      if (byType.size === 0) {
        byType.set(inferUnitTypeFromProperty(p.type), [])
      }

      const vacantUnitTypes: VacancyRow['vacantUnitTypes'] = []
      for (const [unitType, rents] of byType.entries()) {
        const min = rents.length ? Math.min(...rents) : 0
        const max = rents.length ? Math.max(...rents) : 0
        const avg = rents.length ? rents.reduce((a, b) => a + b, 0) / rents.length : 0
        vacantUnitTypes.push({ type: unitType, count: vacantCount, minRent: min, maxRent: max, avgRent: avg })
      }

      // Compute single overall avg (not sum-per-type, which would double-count)
      const overallAvg = vacantUnitTypes.length > 0
        ? vacantUnitTypes.reduce((s, v) => s + v.avgRent, 0) / vacantUnitTypes.length
        : 0
      const estimatedLoss = overallAvg * vacantCount

      vacancyRows.push({
        propertyName: p.name,
        propertyType: p.type,
        address: p.address,
        totalUnits: p.totalUnits,
        occupiedUnits: occupiedCount,
        vacantUnits: vacantCount,
        vacantUnitTypes,
        estimatedMonthlyLoss: estimatedLoss,
      })
    }

    // ─── Aggregate stats ───
    const totalVacantUnits = vacancyRows.reduce((s, r) => s + r.vacantUnits, 0)
    const totalProperties = vacancyRows.length
    const totalEstimatedMonthlyLoss = vacancyRows.reduce((s, r) => s + r.estimatedMonthlyLoss, 0)
    const totalEstimatedAnnualLoss = totalEstimatedMonthlyLoss * 12

    // ═══════════════════════════════════════════════════════════════════════
    // PDF SETUP
    // ═══════════════════════════════════════════════════════════════════════
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // Bottom margin = 0 disables PDFKit's auto page-break, so we have full manual control
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 0, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: 'Vacant Units Report',
        Author: company.name,
        Subject: 'Available Units Across Properties',
        CreationDate: now,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const marginLeft = 50
    const marginRight = 50
    const pageWidth = doc.page.width - marginLeft - marginRight
    const pageHeight = doc.page.height
    const pageTopY = 50
    // Reserve 50px at bottom for footer (we draw footer manually at end)
    const contentBottomLimit = pageHeight - 60

    // ─── Professional color palette (subtle, corporate) ───
    const COLORS = {
      primary: '#0F3D5C',      // deep navy blue
      accent: '#0E7C5A',       // refined emerald
      warning: '#C75B12',      // burnt orange
      danger: '#A02B1F',       // muted red
      textDark: '#1F2937',     // near-black gray
      textBody: '#374151',     // dark gray for body
      textMuted: '#6B7280',    // medium gray
      textLight: '#9CA3AF',    // light gray
      bgLight: '#F3F4F6',      // very light gray for backgrounds
      bgCard: '#FFFFFF',       // white card
      bgHeader: '#E5E7EB',     // table header gray
      border: '#D1D5DB',       // subtle border
      borderLight: '#E5E7EB',  // very subtle border
    }

    // ─── Helpers ───
    const formatAED = (n: number): string =>
      'AED ' + Math.round(n).toLocaleString('en-AE')

    const formatAED2 = (n: number): string =>
      'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const formatUnitType = (type: string): string => {
      const map: Record<string, string> = {
        studio: 'Studio', '1bedroom': '1 Bedroom', '2bedroom': '2 Bedroom',
        '3bedroom': '3 Bedroom', '4bedroom': '4 Bedroom', shop: 'Shop',
        office: 'Office', villa: 'Villa', apartment: 'Apartment', mixed_use: 'Mixed Use',
      }
      return map[type] || type.charAt(0).toUpperCase() + type.slice(1)
    }

    const formatPropertyType = (type: string): string => {
      const map: Record<string, string> = {
        apartment: 'Apartment Building', villa: 'Villa', office: 'Office Building',
        shop: 'Retail / Shops', studio: 'Studio Building', mixed_use: 'Mixed-Use Property',
      }
      return map[type] || type.charAt(0).toUpperCase() + type.slice(1)
    }

    const truncate = (text: string, maxWidth: number, fontName: string, fontSize: number): string => {
      doc.font(fontName).fontSize(fontSize)
      if (doc.widthOfString(text) <= maxWidth) return text
      let t = text
      while (t.length > 0 && doc.widthOfString(t + '…') > maxWidth) t = t.slice(0, -1)
      return t + '…'
    }

    // Pre-calculate card height BEFORE drawing — no surprises
    // Card layout:
    //   padding-top 12 + property name line (16) + 8 + meta line (12) + 10
    //   + occupancy bar (6) + 14
    //   + table header (10) + 8
    //   + unit type rows (n × 18)
    //   + padding-bottom 14
    const calcCardHeight = (row: VacancyRow): number => {
      return 12 + 16 + 8 + 12 + 10 + 6 + 14 + 10 + 8 + (row.vacantUnitTypes.length * 18) + 14
    }

    // Manual page-break helper. Returns updated Y position.
    // If `needed` doesn't fit on current page, start a fresh page (no header on continuation pages,
    // just resume at content top).
    const ensureSpace = (y: number, needed: number): number => {
      if (y + needed > contentBottomLimit) {
        doc.addPage()
        return pageTopY
      }
      return y
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER BAND (only on page 1)
    // ═══════════════════════════════════════════════════════════════════════
    let y = pageTopY

    // Top accent bar (full width, 6px thick)
    doc.rect(0, 0, doc.page.width, 6).fillColor(COLORS.accent).fill()

    // Company name
    doc.fontSize(18).fillColor(COLORS.primary).font('Helvetica-Bold')
    const companyName = company.name || 'Al Reef Al Madeena'
    // Use lineBreak: false + manual truncation to prevent auto-wrap pagination
    const companyNameDisplay = truncate(companyName, pageWidth, 'Helvetica-Bold', 18)
    doc.text(companyNameDisplay, marginLeft, y, { width: pageWidth, lineBreak: false })
    y += 22

    // Report title
    doc.fontSize(13).fillColor(COLORS.textDark).font('Helvetica-Bold')
    doc.text('Vacant Units Availability Report', marginLeft, y, { width: pageWidth, lineBreak: false })
    y += 16

    // Generated date (right-aligned) + "Confidential" (left-aligned)
    doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica')
    doc.text('CONFIDENTIAL — Internal Use Only', marginLeft, y, { width: pageWidth / 2, lineBreak: false })
    doc.text(`Generated: ${today}`, marginLeft + pageWidth / 2, y, { width: pageWidth / 2, align: 'right', lineBreak: false })
    y += 12

    // Separator line
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(1.5).stroke()
    y += 16

    // ═══════════════════════════════════════════════════════════════════════
    // HERO STAT BLOCK — 3 compact cards (height 64)
    // ═══════════════════════════════════════════════════════════════════════
    const cardH = 64
    const cardGap = 10
    const cardW = (pageWidth - 2 * cardGap) / 3

    if (totalVacantUnits === 0) {
      // No vacancies — celebratory banner
      y = ensureSpace(y, 80)
      doc.roundedRect(marginLeft, y, pageWidth, 70, 6).fillColor(COLORS.accent).fill()
      doc.fontSize(16).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('All Units Occupied', marginLeft, y + 22, { width: pageWidth, align: 'center', lineBreak: false })
      doc.fontSize(10).fillColor('#FFFFFF').font('Helvetica')
      doc.text('Currently there are no vacant units across any of your properties.', marginLeft, y + 45, { width: pageWidth, align: 'center', lineBreak: false })
      y += 90
    } else {
      y = ensureSpace(y, cardH + 10)

      // Card 1: Total Vacant Units (orange)
      doc.roundedRect(marginLeft, y, cardW, cardH, 4).fillColor(COLORS.warning).fill()
      doc.fontSize(8).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('TOTAL VACANT UNITS', marginLeft, y + 12, { width: cardW, align: 'center', lineBreak: false })
      doc.fontSize(24).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text(String(totalVacantUnits), marginLeft, y + 28, { width: cardW, align: 'center', lineBreak: false })

      // Card 2: Properties with Vacancy (blue)
      const card2X = marginLeft + cardW + cardGap
      doc.roundedRect(card2X, y, cardW, cardH, 4).fillColor(COLORS.primary).fill()
      doc.fontSize(8).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('PROPERTIES AFFECTED', card2X, y + 12, { width: cardW, align: 'center', lineBreak: false })
      doc.fontSize(24).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text(String(totalProperties), card2X, y + 28, { width: cardW, align: 'center', lineBreak: false })

      // Card 3: Estimated Monthly Loss (red)
      const card3X = card2X + cardW + cardGap
      doc.roundedRect(card3X, y, cardW, cardH, 4).fillColor(COLORS.danger).fill()
      doc.fontSize(8).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('EST. MONTHLY LOSS', card3X, y + 12, { width: cardW, align: 'center', lineBreak: false })
      doc.fontSize(13).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text(formatAED(totalEstimatedMonthlyLoss), card3X, y + 32, { width: cardW, align: 'center', lineBreak: false })

      y += cardH + 10

      // Annual loss callout (one line)
      y = ensureSpace(y, 20)
      doc.fontSize(9).fillColor(COLORS.textMuted).font('Helvetica-Oblique')
      doc.text(
        `Estimated annual revenue impact: ${formatAED(totalEstimatedAnnualLoss)} — based on average rent per unit type`,
        marginLeft, y, { width: pageWidth, align: 'center', lineBreak: false }
      )
      y += 22
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION: SUMMARY TABLE
    // ═══════════════════════════════════════════════════════════════════════
    if (vacancyRows.length > 0) {
      y = ensureSpace(y, 50)
      doc.fontSize(11).fillColor(COLORS.primary).font('Helvetica-Bold')
      doc.text('Summary by Property', marginLeft, y, { width: pageWidth, lineBreak: false })
      y += 14
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(0.5).stroke()
      y += 8

      // Table columns:
      // Property (35%) | Type (15%) | Vacant (10%) | Occ/Total (12%) | Est. Monthly Loss (15%) | Est. Annual (13%)
      const colWidths = {
        property: pageWidth * 0.32,
        type: pageWidth * 0.16,
        vacant: pageWidth * 0.10,
        occTotal: pageWidth * 0.12,
        monthlyLoss: pageWidth * 0.16,
        annual: pageWidth * 0.14,
      }
      const colX = {
        property: marginLeft,
        type: marginLeft + colWidths.property,
        vacant: marginLeft + colWidths.property + colWidths.type,
        occTotal: marginLeft + colWidths.property + colWidths.type + colWidths.vacant,
        monthlyLoss: marginLeft + colWidths.property + colWidths.type + colWidths.vacant + colWidths.occTotal,
        annual: marginLeft + colWidths.property + colWidths.type + colWidths.vacant + colWidths.occTotal + colWidths.monthlyLoss,
      }

      // Table header row (height 22)
      const headerH = 22
      y = ensureSpace(y, headerH)
      doc.rect(marginLeft, y, pageWidth, headerH).fillColor(COLORS.bgHeader).fill()
      doc.fontSize(8).fillColor(COLORS.textDark).font('Helvetica-Bold')
      doc.text('PROPERTY', colX.property + 6, y + 7, { width: colWidths.property - 6, lineBreak: false })
      doc.text('TYPE', colX.type + 4, y + 7, { width: colWidths.type - 4, lineBreak: false })
      doc.text('VACANT', colX.vacant, y + 7, { width: colWidths.vacant, align: 'center', lineBreak: false })
      doc.text('OCC/TOTAL', colX.occTotal, y + 7, { width: colWidths.occTotal, align: 'center', lineBreak: false })
      doc.text('MO. LOSS', colX.monthlyLoss, y + 7, { width: colWidths.monthlyLoss, align: 'right', lineBreak: false })
      doc.text('ANNUAL', colX.annual - 6, y + 7, { width: colWidths.annual, align: 'right', lineBreak: false })
      y += headerH

      // Data rows (each row 20px tall — never split across pages)
      const rowH = 20
      for (const row of vacancyRows) {
        y = ensureSpace(y, rowH)
        // Alternate row background for readability
        const idx = vacancyRows.indexOf(row)
        if (idx % 2 === 1) {
          doc.rect(marginLeft, y, pageWidth, rowH).fillColor(COLORS.bgLight).fill()
        }
        // Bottom border
        doc.moveTo(marginLeft, y + rowH).lineTo(marginLeft + pageWidth, y + rowH)
          .strokeColor(COLORS.borderLight).lineWidth(0.3).stroke()

        doc.fontSize(9).fillColor(COLORS.textDark).font('Helvetica')
        const propName = truncate(row.propertyName, colWidths.property - 8, 'Helvetica', 9)
        doc.text(propName, colX.property + 6, y + 6, { width: colWidths.property - 8, lineBreak: false })

        doc.font('Helvetica').fillColor(COLORS.textMuted)
        doc.text(truncate(formatPropertyType(row.propertyType), colWidths.type - 6, 'Helvetica', 9), colX.type + 4, y + 6, { width: colWidths.type - 6, lineBreak: false })

        doc.font('Helvetica-Bold').fillColor(COLORS.warning)
        doc.text(String(row.vacantUnits), colX.vacant, y + 6, { width: colWidths.vacant, align: 'center', lineBreak: false })

        doc.font('Helvetica').fillColor(COLORS.textBody)
        doc.text(`${row.occupiedUnits}/${row.totalUnits}`, colX.occTotal, y + 6, { width: colWidths.occTotal, align: 'center', lineBreak: false })

        doc.font('Helvetica').fillColor(COLORS.danger)
        const monthlyLossText = row.estimatedMonthlyLoss > 0 ? formatAED(row.estimatedMonthlyLoss) : '—'
        doc.text(truncate(monthlyLossText, colWidths.monthlyLoss - 8, 'Helvetica', 9), colX.monthlyLoss - 2, y + 6, { width: colWidths.monthlyLoss - 6, align: 'right', lineBreak: false })

        doc.font('Helvetica-Bold').fillColor(COLORS.accent)
        const annualText = row.estimatedMonthlyLoss > 0 ? formatAED(row.estimatedMonthlyLoss * 12) : '—'
        doc.text(truncate(annualText, colWidths.annual - 8, 'Helvetica-Bold', 9), colX.annual - 6, y + 6, { width: colWidths.annual - 6, align: 'right', lineBreak: false })

        y += rowH
      }

      // Totals row
      y = ensureSpace(y, rowH + 4)
      doc.rect(marginLeft, y, pageWidth, rowH).fillColor(COLORS.primary).fill()
      doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
      doc.text('TOTALS', colX.property + 6, y + 6, { width: colWidths.property - 6, lineBreak: false })
      doc.text(String(totalVacantUnits), colX.vacant, y + 6, { width: colWidths.vacant, align: 'center', lineBreak: false })
      doc.text(formatAED(totalEstimatedMonthlyLoss), colX.monthlyLoss - 2, y + 6, { width: colWidths.monthlyLoss - 6, align: 'right', lineBreak: false })
      doc.text(formatAED(totalEstimatedAnnualLoss), colX.annual - 6, y + 6, { width: colWidths.annual - 6, align: 'right', lineBreak: false })
      y += rowH + 16
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION: DETAILED CARDS
    // ═══════════════════════════════════════════════════════════════════════
    if (vacancyRows.length > 0) {
      y = ensureSpace(y, 40)
      doc.fontSize(11).fillColor(COLORS.primary).font('Helvetica-Bold')
      doc.text('Detailed Breakdown', marginLeft, y, { width: pageWidth, lineBreak: false })
      y += 14
      doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(0.5).stroke()
      y += 12

      for (const row of vacancyRows) {
        const cardHeight = calcCardHeight(row)
        // Page break BEFORE drawing card if it doesn't fit
        y = ensureSpace(y, cardHeight + 8)

        const cardX = marginLeft
        const cardY = y

        // Card background (white with subtle border)
        doc.roundedRect(cardX, cardY, pageWidth, cardHeight, 4)
          .fillColor(COLORS.bgCard).fill()
        doc.roundedRect(cardX, cardY, pageWidth, cardHeight, 4)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke()
        // Left accent stripe
        doc.rect(cardX, cardY, 3, cardHeight).fillColor(COLORS.warning).fill()

        // ── Row 1: Property name + vacant badge ──
        let innerY = cardY + 12
        doc.fontSize(12).fillColor(COLORS.primary).font('Helvetica-Bold')
        const propName = truncate(row.propertyName, pageWidth - 120, 'Helvetica-Bold', 12)
        doc.text(propName, cardX + 12, innerY, { width: pageWidth - 120, lineBreak: false })

        // Vacant badge on the right
        const badgeText = `${row.vacantUnits} VACANT`
        doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
        const badgeW = doc.widthOfString(badgeText) + 14
        const badgeX = cardX + pageWidth - badgeW - 12
        doc.roundedRect(badgeX, innerY, badgeW, 16, 3).fillColor(COLORS.warning).fill()
        doc.text(badgeText, badgeX, innerY + 3, { width: badgeW, align: 'center', lineBreak: false })

        innerY += 24

        // ── Row 2: Meta line ──
        const occupancyPct = row.totalUnits > 0 ? Math.round((row.occupiedUnits / row.totalUnits) * 100) : 0
        const metaText = `${formatPropertyType(row.propertyType)}  •  ${row.occupiedUnits}/${row.totalUnits} units occupied (${occupancyPct}%)${row.address ? '  •  ' + truncate(row.address, 180, 'Helvetica', 8) : ''}`
        doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica')
        doc.text(metaText, cardX + 12, innerY, { width: pageWidth - 24, lineBreak: false })
        innerY += 14

        // ── Row 3: Occupancy progress bar ──
        const barWidth = pageWidth - 24
        const barX = cardX + 12
        doc.roundedRect(barX, innerY, barWidth, 5, 2).fillColor(COLORS.bgLight).fill()
        const filledWidth = (barWidth * occupancyPct) / 100
        if (filledWidth > 0) {
          doc.roundedRect(barX, innerY, filledWidth, 5, 2).fillColor(COLORS.accent).fill()
        }
        innerY += 12

        // ── Row 4: Table header ──
        const tableX = cardX + 12
        const tableW = pageWidth - 24
        // Columns: Unit Type (30%) | Vacant (15%) | Price Range (35%) | Est Annual (20%)
        const tColType = tableW * 0.30
        const tColVacant = tableW * 0.15
        const tColPrice = tableW * 0.35
        const tColAnnual = tableW * 0.20

        doc.fontSize(7).fillColor(COLORS.textMuted).font('Helvetica-Bold')
        doc.text('UNIT TYPE', tableX, innerY, { width: tColType, lineBreak: false })
        doc.text('VACANT', tableX + tColType, innerY, { width: tColVacant, align: 'center', lineBreak: false })
        doc.text('PRICE RANGE (MONTHLY)', tableX + tColType + tColVacant, innerY, { width: tColPrice, align: 'center', lineBreak: false })
        doc.text('EST. ANNUAL RENT', tableX + tColType + tColVacant + tColPrice, innerY, { width: tColAnnual, align: 'right', lineBreak: false })
        // Subtle separator under header
        doc.moveTo(tableX, innerY + 10).lineTo(tableX + tableW, innerY + 10)
          .strokeColor(COLORS.borderLight).lineWidth(0.3).stroke()
        innerY += 14

        // ── Rows: One per unit type ──
        for (const ut of row.vacantUnitTypes) {
          doc.fontSize(9).fillColor(COLORS.textDark).font('Helvetica')
          doc.text(formatUnitType(ut.type), tableX, innerY, { width: tColType, lineBreak: false })

          doc.font('Helvetica-Bold').fillColor(COLORS.warning)
          doc.text(String(ut.count), tableX + tColType, innerY, { width: tColVacant, align: 'center', lineBreak: false })

          doc.font('Helvetica').fillColor(COLORS.textBody)
          let priceRange: string
          if (ut.minRent === 0 && ut.maxRent === 0) {
            priceRange = 'N/A (no comparable units)'
          } else if (ut.minRent === ut.maxRent) {
            priceRange = formatAED2(ut.minRent)
          } else {
            priceRange = `${formatAED2(ut.minRent)} – ${formatAED2(ut.maxRent)}`
          }
          doc.text(truncate(priceRange, tColPrice - 4, 'Helvetica', 9), tableX + tColType + tColVacant, innerY, { width: tColPrice, align: 'center', lineBreak: false })

          const estAnnual = ut.avgRent * 12
          doc.font('Helvetica-Bold').fillColor(COLORS.accent)
          const annualText = estAnnual > 0 ? formatAED(estAnnual) : '—'
          doc.text(annualText, tableX + tColType + tColVacant + tColPrice, innerY, { width: tColAnnual, align: 'right', lineBreak: false })

          innerY += 18
        }

        y += cardHeight + 8
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER on every page (drawn last using bufferedPageRange)
    // ═══════════════════════════════════════════════════════════════════════
    const range = doc.bufferedPageRange()
    const totalPages = range.start + range.count
    for (let i = range.start; i < totalPages; i++) {
      doc.switchToPage(i)
      // Footer separator line
      doc.moveTo(marginLeft, pageHeight - 35).lineTo(marginLeft + pageWidth, pageHeight - 35)
        .strokeColor(COLORS.borderLight).lineWidth(0.3).stroke()
      // Left: company name + report title
      doc.fontSize(7).fillColor(COLORS.textMuted).font('Helvetica')
      doc.text(
        `${company.name} — Vacant Units Report`,
        marginLeft, pageHeight - 25, { width: pageWidth / 2 - 10, align: 'left', lineBreak: false }
      )
      // Center: generated date
      doc.text(
        today,
        marginLeft + pageWidth / 2 - 50, pageHeight - 25, { width: 100, align: 'center', lineBreak: false }
      )
      // Right: page numbers
      doc.text(
        `Page ${i + 1} of ${totalPages}`,
        marginLeft + pageWidth / 2, pageHeight - 25, { width: pageWidth / 2 - 10, align: 'right', lineBreak: false }
      )
    }

    // ─── Finalize ───
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.end()
    })

    const filename = `Vacant_Units_Report_${today}.pdf`

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error: any) {
    console.error('[VACANT_UNITS_PDF] Error:', error)
    return errorResponse(`Failed to generate PDF: ${error.message}`, 500)
  }
}

// ─── Helper: infer unit type from property type ───
function inferUnitTypeFromProperty(propertyType: string): string {
  switch (propertyType) {
    case 'studio': return 'studio'
    case 'shop': return 'shop'
    case 'office': return 'office'
    case 'villa': return 'villa'
    case 'apartment':
    case 'mixed_use':
    default:
      return 'apartment'
  }
}
