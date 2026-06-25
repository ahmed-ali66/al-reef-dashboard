import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  unauthorizedResponse,
  isFinancialUser,
  safeNumber,
} from '@/lib/api-utils'
import { FINANCIALLY_ACTIVE_STATUSES } from '@/lib/utils'
import PDFDocument from 'pdfkit'

// GET /api/properties/vacant-units-pdf — Generate a visually engaging PDF listing all vacant units
// across all properties, with property name, unit type, monthly rent, and annual rent.
//
// A unit is "vacant" if the property's totalUnits > number of financially-active tenants.
// We list each property that has at least one vacant slot, and show estimated vacancy counts
// plus the typical rent for that property's unit type (median of occupied units).
//
// Visual design:
//   - Header band with company branding
//   - Hero stat block: total vacant units / total properties / estimated monthly loss
//   - Per-property cards grouped by property, each showing:
//       * Property name + type + total/occupied/vacant counts
//       * Vacant unit type (inferred from existing tenants' unitType, or property.type)
//       * Price range (lowest-highest rent among occupied units)
//       * Estimated annual rent for the vacant slot
//   - Footer with generated timestamp

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
            leaseStart: true,
            leaseEnd: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // ─── Build vacancy data per property ───
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

    const vacancyRows: VacancyRow[] = []

    for (const p of properties) {
      const activeTenants = p.tenants.filter(t => (FINANCIALLY_ACTIVE_STATUSES as readonly string[]).includes(t.status))
      const occupiedCount = activeTenants.length
      const vacantCount = Math.max(0, p.totalUnits - occupiedCount)

      if (vacantCount === 0) continue // skip properties at full occupancy

      // Group occupied units by unitType to infer pricing for vacant slots
      const byType = new Map<string, number[]>()
      for (const t of activeTenants) {
        const ut = t.unitType || inferUnitTypeFromProperty(p.type)
        if (!byType.has(ut)) byType.set(ut, [])
        byType.get(ut)!.push(safeNumber(t.rentAmount))
      }

      // If no occupied units at all (entire property vacant), use property.type as the unit type
      if (byType.size === 0) {
        byType.set(inferUnitTypeFromProperty(p.type), [])
      }

      const vacantUnitTypes: VacancyRow['vacantUnitTypes'] = []
      let estimatedLoss = 0

      // If there's only one unit type, all vacant slots belong to it.
      // If multiple types exist, we can't precisely assign vacancies — list all types proportionally.
      // Simplest accurate approach: list each type with its price range, and the user can infer.
      for (const [unitType, rents] of byType.entries()) {
        const min = rents.length ? Math.min(...rents) : 0
        const max = rents.length ? Math.max(...rents) : 0
        const avg = rents.length ? rents.reduce((a, b) => a + b, 0) / rents.length : 0
        vacantUnitTypes.push({
          type: unitType,
          count: vacantCount, // we show total vacancy count per type when ambiguous
          minRent: min,
          maxRent: max,
          avgRent: avg,
        })
        // Use avg rent × vacancy count as the loss estimate
        estimatedLoss += avg * vacantCount
      }

      // For properties with a single unit type, only count once
      if (vacantUnitTypes.length > 0) {
        // Recompute loss as avg across types × vacant count (not sum per type, which double-counts)
        const overallAvg = vacantUnitTypes.reduce((s, v) => s + v.avgRent, 0) / vacantUnitTypes.length
        estimatedLoss = overallAvg * vacantCount
      }

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

    // ─── Generate PDF ───
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
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
    const contentBottomLimit = pageHeight - 70

    // ─── Color palette ───
    const COLORS = {
      primary: '#1a5276',     // deep blue
      accent: '#16a085',      // emerald
      warning: '#e67e22',     // orange for vacancy
      danger: '#c0392b',      // red for losses
      textDark: '#2c3e50',
      textMuted: '#7f8c8d',
      textLight: '#bdc3c7',
      bgLight: '#ecf0f1',
      bgCard: '#fbfcfc',
      border: '#d5dbdb',
    }

    // ─── Helper: truncate text ───
    const truncateText = (text: string, maxWidth: number, fontName: string, fontSize: number): string => {
      doc.font(fontName).fontSize(fontSize)
      if (doc.widthOfString(text) <= maxWidth) return text
      let truncated = text
      while (truncated.length > 0 && doc.widthOfString(truncated + '...') > maxWidth) {
        truncated = truncated.slice(0, -1)
      }
      return truncated + '...'
    }

    // ─── Helper: format AED ───
    const formatAED = (n: number): string => {
      return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    }

    // ─── Helper: format AED with decimals ───
    const formatAED2 = (n: number): string => {
      return 'AED ' + n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    // ─── Helper: format unit type for display ───
    const formatUnitType = (type: string): string => {
      const map: Record<string, string> = {
        'studio': 'Studio',
        '1bedroom': '1 Bedroom',
        '2bedroom': '2 Bedroom',
        '3bedroom': '3 Bedroom',
        '4bedroom': '4 Bedroom',
        'shop': 'Shop',
        'office': 'Office',
        'villa': 'Villa',
        'apartment': 'Apartment',
        'mixed_use': 'Mixed Use',
      }
      return map[type] || type.charAt(0).toUpperCase() + type.slice(1)
    }

    // ─── Helper: format property type ───
    const formatPropertyType = (type: string): string => {
      const map: Record<string, string> = {
        'apartment': 'Apartment Building',
        'villa': 'Villa',
        'office': 'Office Building',
        'shop': 'Retail / Shops',
        'studio': 'Studio Building',
        'mixed_use': 'Mixed-Use Property',
      }
      return map[type] || type.charAt(0).toUpperCase() + type.slice(1)
    }

    // ─── Helper: ensure space, add page if needed ───
    const ensureSpace = (y: number, needed: number): number => {
      if (y + needed > contentBottomLimit) {
        doc.addPage()
        return 50
      }
      return y
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER BAND
    // ═══════════════════════════════════════════════════════════════════════
    let y = 50

    // Top accent bar
    doc.rect(0, 0, doc.page.width, 8).fillColor(COLORS.accent).fill()

    // Company name
    doc.fontSize(20).fillColor(COLORS.primary).font('Helvetica-Bold')
    const companyName = company.name || 'Al Reef Al Madeena'
    doc.text(companyName, marginLeft, y, { width: pageWidth, lineBreak: true })
    y += doc.heightOfString(companyName, { width: pageWidth, fontSize: 20 }) + 6

    // Report title
    doc.fontSize(15).fillColor(COLORS.textDark).font('Helvetica-Bold')
    doc.text('Vacant Units Availability Report', marginLeft, y, { width: pageWidth })
    y += doc.heightOfString('Vacant Units Availability Report', { width: pageWidth, fontSize: 15 }) + 6

    // Generated date
    doc.fontSize(9).fillColor(COLORS.textMuted).font('Helvetica')
    doc.text(`Generated: ${today}`, marginLeft, y, { width: pageWidth })
    y += 18

    // Separator
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(2).stroke()
    y += 18

    // ═══════════════════════════════════════════════════════════════════════
    // HERO STAT BLOCK — 3 large stat cards
    // ═══════════════════════════════════════════════════════════════════════
    if (totalVacantUnits === 0) {
      // No vacancies — show celebratory message
      y = ensureSpace(y, 100)
      doc.roundedRect(marginLeft, y, pageWidth, 80, 8).fillColor(COLORS.accent).fill()
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
      doc.text('All Units Occupied', marginLeft + 20, y + 20, { width: pageWidth - 40, align: 'center' })
      doc.fontSize(11).fillColor('#ffffff').font('Helvetica')
      doc.text('Currently there are no vacant units across any of your properties.', marginLeft + 20, y + 45, { width: pageWidth - 40, align: 'center' })
      y += 100
    } else {
      const cardWidth = (pageWidth - 20) / 3 // 3 cards with 10px gaps
      const cardHeight = 70

      // Card 1: Total Vacant Units (orange)
      doc.roundedRect(marginLeft, y, cardWidth, cardHeight, 6).fillColor(COLORS.warning).fill()
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica')
      doc.text('TOTAL VACANT UNITS', marginLeft + 10, y + 12, { width: cardWidth - 20, align: 'center' })
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
      doc.text(String(totalVacantUnits), marginLeft + 10, y + 30, { width: cardWidth - 20, align: 'center' })

      // Card 2: Properties Affected (blue)
      doc.roundedRect(marginLeft + cardWidth + 10, y, cardWidth, cardHeight, 6).fillColor(COLORS.primary).fill()
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica')
      doc.text('PROPERTIES WITH VACANCY', marginLeft + cardWidth + 20, y + 12, { width: cardWidth - 20, align: 'center' })
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
      doc.text(String(totalProperties), marginLeft + cardWidth + 20, y + 30, { width: cardWidth - 20, align: 'center' })

      // Card 3: Estimated Monthly Loss (red)
      doc.roundedRect(marginLeft + (cardWidth + 10) * 2, y, cardWidth, cardHeight, 6).fillColor(COLORS.danger).fill()
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica')
      doc.text('EST. MONTHLY LOSS', marginLeft + (cardWidth + 10) * 2 + 10, y + 12, { width: cardWidth - 20, align: 'center' })
      doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold')
      doc.text(formatAED(totalEstimatedMonthlyLoss), marginLeft + (cardWidth + 10) * 2 + 10, y + 35, { width: cardWidth - 20, align: 'center' })

      y += cardHeight + 16

      // Annual loss callout
      doc.fontSize(10).fillColor(COLORS.textMuted).font('Helvetica-Oblique')
      doc.text(
        `Estimated annual revenue impact from vacancies: ${formatAED(totalEstimatedAnnualLoss)} (based on average rent per unit type)`,
        marginLeft, y, { width: pageWidth, align: 'center' }
      )
      y += 24
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PER-PROPERTY CARDS
    // ═══════════════════════════════════════════════════════════════════════

    // Section title
    y = ensureSpace(y, 40)
    doc.fontSize(13).fillColor(COLORS.primary).font('Helvetica-Bold')
    doc.text('Available Units by Property', marginLeft, y, { width: pageWidth })
    y += doc.heightOfString('Available Units by Property', { width: pageWidth, fontSize: 13 }) + 4
    doc.moveTo(marginLeft, y).lineTo(marginLeft + pageWidth, y).strokeColor(COLORS.primary).lineWidth(0.5).stroke()
    y += 14

    for (const row of vacancyRows) {
      // Each property card: ~110px tall (more if multiple unit types)
      const cardHeight = 70 + row.vacantUnitTypes.length * 22 + 10
      y = ensureSpace(y, cardHeight + 10)

      // Card background
      doc.roundedRect(marginLeft, y, pageWidth, cardHeight, 6)
        .fillColor(COLORS.bgCard)
        .fill()
      // Card border (left accent stripe)
      doc.roundedRect(marginLeft, y, 4, cardHeight, 2).fillColor(COLORS.warning).fill()

      // Property name + type
      let innerY = y + 12
      doc.fontSize(13).fillColor(COLORS.primary).font('Helvetica-Bold')
      const propName = truncateText(row.propertyName, pageWidth - 100, 'Helvetica-Bold', 13)
      doc.text(propName, marginLeft + 14, innerY, { width: pageWidth - 100 })
      // Vacant badge on the right
      doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold')
      const badgeText = `${row.vacantUnits} VACANT`
      const badgeWidth = doc.widthOfString(badgeText) + 16
      doc.roundedRect(marginLeft + pageWidth - badgeWidth - 12, innerY + 1, badgeWidth, 18, 4).fillColor(COLORS.warning).fill()
      doc.text(badgeText, marginLeft + pageWidth - badgeWidth - 12, innerY + 4, { width: badgeWidth, align: 'center' })

      innerY += 22

      // Property type + address + occupancy bar
      doc.fontSize(9).fillColor(COLORS.textMuted).font('Helvetica')
      const occupancyPct = row.totalUnits > 0 ? Math.round((row.occupiedUnits / row.totalUnits) * 100) : 0
      const meta = `${formatPropertyType(row.propertyType)}  •  ${row.occupiedUnits}/${row.totalUnits} occupied (${occupancyPct}%)${row.address ? '  •  ' + truncateText(row.address, 200, 'Helvetica', 9) : ''}`
      doc.text(meta, marginLeft + 14, innerY, { width: pageWidth - 28 })
      innerY += 16

      // Occupancy progress bar
      const barWidth = pageWidth - 28
      const barX = marginLeft + 14
      doc.roundedRect(barX, innerY, barWidth, 6, 3).fillColor(COLORS.bgLight).fill()
      const filledWidth = (barWidth * occupancyPct) / 100
      if (filledWidth > 0) {
        doc.roundedRect(barX, innerY, filledWidth, 6, 3).fillColor(COLORS.accent).fill()
      }
      innerY += 14

      // Header for unit type table
      doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica-Bold')
      doc.text('UNIT TYPE', barX, innerY, { width: 140 })
      doc.text('VACANT SLOTS', barX + 150, innerY, { width: 90, align: 'center' })
      doc.text('PRICE RANGE (monthly)', barX + 250, innerY, { width: 180, align: 'center' })
      doc.text('EST. ANNUAL RENT', barX + pageWidth - 28 - 100, innerY, { width: 100, align: 'right' })
      innerY += 14

      // Rows for each unit type
      for (const ut of row.vacantUnitTypes) {
        doc.fontSize(10).fillColor(COLORS.textDark).font('Helvetica')
        doc.text(formatUnitType(ut.type), barX, innerY, { width: 140 })

        doc.font('Helvetica-Bold').fillColor(COLORS.warning)
        doc.text(String(ut.count), barX + 150, innerY, { width: 90, align: 'center' })

        doc.font('Helvetica').fillColor(COLORS.textDark)
        const priceRange = ut.minRent === 0 && ut.maxRent === 0
          ? 'N/A (no comparable units)'
          : ut.minRent === ut.maxRent
            ? formatAED2(ut.minRent)
            : `${formatAED2(ut.minRent)} – ${formatAED2(ut.maxRent)}`
        doc.text(priceRange, barX + 250, innerY, { width: 180, align: 'center' })

        const estAnnual = ut.avgRent * 12
        doc.font('Helvetica-Bold').fillColor(COLORS.accent)
        doc.text(estAnnual > 0 ? formatAED(estAnnual) : '—', barX + pageWidth - 28 - 100, innerY, { width: 100, align: 'right' })

        innerY += 22
      }

      y += cardHeight + 8
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER on every page
    // ═══════════════════════════════════════════════════════════════════════
    const pages = doc.bufferedPageCount()
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i)
      // Footer line
      doc.moveTo(marginLeft, pageHeight - 40).lineTo(marginLeft + pageWidth, pageHeight - 40)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke()
      // Footer text
      doc.fontSize(8).fillColor(COLORS.textMuted).font('Helvetica')
      doc.text(
        `${company.name} — Vacant Units Report — Generated ${today}`,
        marginLeft, pageHeight - 30, { width: pageWidth / 2 - 10, align: 'left' }
      )
      doc.text(
        `Page ${i + 1} of ${pages}`,
        marginLeft + pageWidth / 2, pageHeight - 30, { width: pageWidth / 2 - 10, align: 'right' }
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
  // When a tenant has no unitType set, we infer it from the property type
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
