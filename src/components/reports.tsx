'use client'

import { useEffect, useState, useCallback, useRef, type RefObject } from 'react'
import type { ReportData, PaymentData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, formatDate, getCategoryIcon, isFinanciallyActive } from '@/lib/utils'
import { calculateEffectivePaymentsReceived } from '@/lib/financial-utils'
import { t, getMonthName, getExpenseCategoryLabel, getNameByLang, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Home,
  BarChart3,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  FileSpreadsheet,
  FileText,
  CreditCard,
  AlertTriangle,
  Receipt,
  RefreshCw,
  Building2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart,
} from 'recharts'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { toast } from 'sonner'

const PIE_COLORS = ['#0D7C3D', '#C5A028', '#0A5C4E', '#C4653A', '#8b5cf6', '#ef4444', '#06b6d4']

function getTenantScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Warning'
  return 'Poor'
}

function getUnitTypeLabel(type: string | null): string {
  switch (type) {
    case 'studio': return 'Studio'
    case '1bedroom': return '1 Bedroom'
    case '2bedroom': return '2 Bedroom'
    case '3bedroom': return '3 Bedroom'
    case 'shop': return 'Shop'
    case 'office': return 'Office'
    default: return type || ''
  }
}

function getPropertyTypeLabel(type: string): string {
  switch (type) {
    case 'apartment': return 'Apartment'
    case 'villa': return 'Villa'
    case 'office': return 'Office'
    case 'shop': return 'Shop'
    case 'studio': return 'Studio'
    case 'mixed_use': return 'Mixed Use'
    default: return type
  }
}

function getMaintenanceCategoryLabelExport(category: string | null): string {
  switch (category) {
    case 'ac': return 'AC'
    case 'plumbing': return 'Plumbing'
    case 'electrical': return 'Electrical'
    case 'lock_door': return 'Lock/Door'
    case 'painting': return 'Painting'
    case 'structural': return 'Structural'
    default: return category || 'Other'
  }
}

function getExpenseCategoryLabelExport(category: string): string {
  switch (category) {
    case 'maintenance': return 'Maintenance'
    case 'utility': case 'utilities': return 'Utilities'
    case 'insurance': return 'Insurance'
    case 'manpower': return 'Manpower/Staff'
    case 'municipality': return 'Municipality Fees'
    case 'leasing': return 'Leasing Commission'
    case 'security': return 'Security'
    default: return 'Other'
  }
}

export default function Reports() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Refs for chart sections to capture for PDF
  const barChartRef = useRef<HTMLDivElement>(null)
  const pieChartRef = useRef<HTMLDivElement>(null)
  const areaChartRef = useRef<HTMLDivElement>(null)

  // Access control: Owner/Admin only
  const canAccess = authUser && isOwnerOrAdmin(authUser.role)

  const fetchData = useCallback(() => {
    try {
      const reportData = useDataStore.getState().getReportData(selectedMonth, selectedYear)
      if (reportData) setData(reportData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportPDF = useCallback(async () => {
    if (!data) return
    try {
      setExportingPDF(true)
      const store = useDataStore.getState()
      const { company } = store
      const monthName = getMonthName(selectedMonth, 'en')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      const contentWidth = pageWidth - margin * 2

      // ── Page 1: Title Page ──
      pdf.setFillColor(13, 124, 61) // #0D7C3D
      pdf.rect(0, 0, pageWidth, 50, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(24)
      pdf.text('Al Reef Al Madeena', pageWidth / 2, 20, { align: 'center' })
      pdf.setFontSize(12)
      pdf.text('Real Estate Management and General Maintenance - L.L.C - S.P.C', pageWidth / 2, 30, { align: 'center' })
      pdf.setFontSize(16)
      pdf.text(`${t('financialSummary', lang)} - ${monthName} ${selectedYear}`, pageWidth / 2, 42, { align: 'center' })

      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(10)
      pdf.text(`${t('generatedOn', lang)}: ${new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 65)
      pdf.text(`Report Period: ${monthName} ${selectedYear}`, margin, 72)

      // Key metrics box
      let y = 85
      const metrics = [
        [t('cashCollected', lang), formatAED(data.cashCollected)],
        [t('adjustmentsTotal', lang), `-${formatAED(data.adjustmentTotal)}`],
        [t('netRevenue', lang), formatAED(data.netRevenue)],
        [t('expenses', lang), formatAED(data.totalExpenses)],
        [t('profitOrLoss', lang), formatAED(data.profitLoss)],
        [t('collectionRate', lang), `${data.collectionRate}%`],
        [t('occupancyRate', lang), `${data.occupancyRate}%`],
        [t('grossRevenue', lang), formatAED(data.grossRevenue)],
        [t('netIncome', lang), formatAED(data.netIncome)],
      ]
      const metricsBoxHeight = 18 + metrics.length * 7 + 5
      pdf.setFillColor(245, 245, 245)
      pdf.roundedRect(margin, y, contentWidth, metricsBoxHeight, 3, 3, 'F')
      pdf.setFontSize(12)
      pdf.setTextColor(13, 124, 61)
      pdf.text(t('financialSummary', lang), margin + 5, y + 10)
      pdf.setFontSize(10)
      pdf.setTextColor(0, 0, 0)

      metrics.forEach(([label, value], idx) => {
        const rowY = y + 18 + idx * 7
        pdf.text(label, margin + 8, rowY)
        pdf.text(value, margin + contentWidth - 8, rowY, { align: 'right' })
      })

      // ── Page 2: Building Performance Summary (per-property overview) ──
      // NOTE: Per-tenant/client breakdowns are intentionally omitted from the monthly
      // report. That level of detail belongs in the daily report. The monthly report
      // focuses on portfolio-level clarity: per-building expected vs collected vs remaining,
      // reservations, and recurring bills.
      const { payments: allPayments, tenants: allTenants, properties: allProperties, reservations: allReservations, tenantGroups: allTenantGroups } = store
      const monthPayments = allPayments.filter(p => p.month === selectedMonth && p.year === selectedYear)

      // Payment method sort priority: Cash → Bank Transfer → Cheque → Other
      const getMethodSortPriority = (method: string | null): number => {
        switch ((method || '').toLowerCase()) {
          case 'cash': return 1
          case 'bank_transfer': case 'transfer': return 2
          case 'cheque': return 3
          default: return 4
        }
      }

      // Build income items (rent + reservation deposits) — used ONLY for payment-method totals
      interface MonthlyIncomeItem {
        tenantName: string
        propertyName: string
        unitNumber: string | null
        amount: number
        method: string | null
        isLate: boolean
        source: 'rent' | 'reservation'
        groupId: string | null
        reference: string | null
        isConsolidated: boolean
      }

      const monthlyIncomeItems: MonthlyIncomeItem[] = monthPayments.map(p => {
        const tenant = allTenants.find(t => t.id === p.tenantId)
        const property = tenant ? allProperties.find(pr => pr.id === tenant.propertyId) : null
        return {
          tenantName: tenant ? getNameByLang(tenant, lang) : 'Unknown',
          propertyName: property ? getNameByLang(property, lang) : '',
          unitNumber: tenant?.unitNumber || null,
          amount: p.amount,
          method: p.method,
          isLate: p.isLate || false,
          source: 'rent' as const,
          groupId: tenant?.groupId || null,
          reference: p.reference || null,
          isConsolidated: false,
        }
      })

      // Include reservation deposits as income items for the selected month
      const activeReservations = (allReservations || []).filter((r: any) =>
        r.status !== 'cancelled' && !r.deletedAt && (r.depositStatus === 'paid' || r.depositStatus === 'partial')
      )
      for (const r of activeReservations) {
        const paymentDateStr = r.depositPaymentDate
          ? new Date(r.depositPaymentDate).toISOString().split('T')[0]
          : r.reservationDate
            ? new Date(r.reservationDate).toISOString().split('T')[0]
            : ''
        if (paymentDateStr) {
          const paymentMonth = parseInt(paymentDateStr.split('-')[1], 10)
          const paymentYear = parseInt(paymentDateStr.split('-')[0], 10)
          if (paymentMonth === selectedMonth && paymentYear === selectedYear) {
            const property = allProperties.find((p: any) => p.id === r.propertyId)
            monthlyIncomeItems.push({
              tenantName: r.prospectName || 'Reservation',
              propertyName: property ? getNameByLang(property, lang) : '',
              unitNumber: r.unitNumber || null,
              amount: r.depositAmount,
              method: r.depositPaymentMethod || 'cash',
              isLate: false,
              source: 'reservation' as const,
              groupId: null,
              reference: null,
              isConsolidated: false,
            })
          }
        }
      }

      // Consolidate linked-unit (group) payments — needed for accurate method totals
      const consolidatedMonthlyItems: MonthlyIncomeItem[] = []
      const groupBuckets = new Map<string, MonthlyIncomeItem[]>()
      for (const item of monthlyIncomeItems) {
        if (item.groupId) {
          const key = `${item.groupId}|${item.method || 'none'}|${item.reference || 'none'}`
          if (!groupBuckets.has(key)) groupBuckets.set(key, [])
          groupBuckets.get(key)!.push(item)
        } else {
          consolidatedMonthlyItems.push(item)
        }
      }
      for (const [, items] of groupBuckets) {
        if (items.length === 1) {
          consolidatedMonthlyItems.push(items[0])
        } else {
          const first = items[0]
          const tenantGroup = allTenantGroups.find((g: any) => g.id === first.groupId)
          consolidatedMonthlyItems.push({
            tenantName: tenantGroup ? getNameByLang(tenantGroup, lang) : first.tenantName,
            propertyName: first.propertyName,
            unitNumber: items.map(i => i.unitNumber).filter(Boolean).join(', '),
            amount: items.reduce((sum, i) => sum + i.amount, 0),
            method: first.method,
            isLate: items.some(i => i.isLate),
            source: first.source,
            groupId: first.groupId,
            reference: first.reference,
            isConsolidated: true,
          })
        }
      }

      // Sort by method priority then tenant name (kept for consistency)
      consolidatedMonthlyItems.sort((a, b) => {
        const methodDiff = getMethodSortPriority(a.method) - getMethodSortPriority(b.method)
        if (methodDiff !== 0) return methodDiff
        return a.tenantName.localeCompare(b.tenantName)
      })

      // ── Compute per-building performance metrics ──
      // CRITICAL: "Collected" must reflect ONLY the portion of payments that applies to
      // THIS MONTH'S expected rent. Otherwise advance payments (e.g. a tenant paying
      // 3 months in advance) and historical-debt repayments inflate the collection rate
      // above 100% and mask underperforming buildings.
      //
      // Methodology (consistent with rent-collection.tsx and financial-utils.ts):
      //   - HISTORICAL_DEBT payments → EXCLUDED (already reflected in reduced openingBalance)
      //   - ADVANCE_PAYMENT payments → CAPPED at the tenant's current-month charges;
      //     the excess is the tenant's creditBalance and is tracked separately as `surplus`
      //   - CURRENT_RENT (and untyped) payments → fully counted
      //
      // Result: collectionRate never exceeds 100%, and `surplus` shows the real extra
      // cash received from advance payments (displayed as a small footnote per building).
      interface BuildingPerf {
        name: string
        totalUnits: number
        occupied: number
        expected: number
        collected: number      // effective collected (capped at current-month charges)
        rawCollected: number   // actual cash received (includes advances + historical debt)
        surplus: number        // advance portion exceeding current-month charges (real cash, but not counted in rate)
        remaining: number
        collectionRate: number // 0-100, never exceeds 100
      }
      const buildingPerf: BuildingPerf[] = allProperties
        .filter(p => !p.archived)
        .map(property => {
          const propTenants = allTenants.filter(t => t.propertyId === property.id && isFinanciallyActive(t.status))
          const expected = propTenants.reduce((sum, t) => sum + (t.rentAmount || 0), 0)

          // Per-tenant effective collected (capped at current charges; excludes historical debt)
          let collected = 0
          let rawCollected = 0
          for (const tenant of propTenants) {
            const tenantMonthPayments = monthPayments.filter(p => p.tenantId === tenant.id)
            // Raw sum of ALL payments received this month (real cash, regardless of allocation)
            const tenantRaw = tenantMonthPayments.reduce((s, p) => s + p.amount, 0)
            rawCollected += tenantRaw
            // Effective collected (applies allocation convention)
            const tenantEffective = calculateEffectivePaymentsReceived(
              tenantMonthPayments,
              tenant.rentAmount || 0,
              0, // municipalityFee — not part of "Expected Rent" column, so excluded for consistency
              0, // adjustments — would need tenant-level lookup; keep 0 to match Expected definition
            )
            collected += tenantEffective
          }

          // Surplus = real cash received minus effective collected (advance payments above current charges)
          const surplus = Math.max(0, rawCollected - collected)
          const remaining = Math.max(0, expected - collected)
          const collectionRate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0
          return {
            name: getNameByLang(property, lang) || 'Unnamed',
            totalUnits: property.totalUnits || 0,
            occupied: propTenants.length,
            expected,
            collected,
            rawCollected,
            surplus,
            remaining,
            collectionRate,
          }
        })
        .filter(b => b.totalUnits > 0 || b.occupied > 0 || b.expected > 0)
        // Sort by collection rate ASCENDING (lowest collection % first → highlights underperformers at top)
        .sort((a, b) => {
          if (a.collectionRate !== b.collectionRate) return a.collectionRate - b.collectionRate
          // Tiebreaker: highest remaining amount first (biggest outstanding $ on top within same rate)
          return b.remaining - a.remaining
        })

      const totalExpected = buildingPerf.reduce((s, b) => s + b.expected, 0)
      const totalCollected = buildingPerf.reduce((s, b) => s + b.collected, 0)
      const totalRawCollected = buildingPerf.reduce((s, b) => s + b.rawCollected, 0)
      const totalSurplus = buildingPerf.reduce((s, b) => s + b.surplus, 0)
      const totalRemaining = buildingPerf.reduce((s, b) => s + b.remaining, 0)
      const totalUnitsAll = buildingPerf.reduce((s, b) => s + b.totalUnits, 0)
      const totalOccupiedAll = buildingPerf.reduce((s, b) => s + b.occupied, 0)
      const overallRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0

      // ── Fetch recurring bills summary for the month ──
      let recurringBillsSummary: any = null
      try {
        const resp = await fetch(`/api/recurring-bills/summary?month=${selectedMonth}&year=${selectedYear}`, { credentials: 'include' })
        if (resp.ok) {
          const json = await resp.json()
          recurringBillsSummary = json?.data || json
        }
      } catch { /* graceful skip */ }

      // ── Render Building Performance Summary page ──
      pdf.addPage()
      let creditY = 18
      // Mini header bar
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pageWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Al Reef Al Madeena', margin, 9)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(`Building Performance — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
      creditY = 22

      // Section title + description
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Building Performance Summary', margin, creditY)
      creditY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Per-property rent collection — sorted from lowest to highest collection rate.', margin, creditY)
      creditY += 4
      pdf.setFontSize(7)
      pdf.setTextColor(140, 140, 140)
      pdf.text('Collected reflects only current-month rent. Advance payments & historical-debt repayments are excluded from the rate (shown separately as surplus).', margin, creditY)
      creditY += 6

      // Summary KPI strip (4 tiles): Expected | Collected | Remaining | Advance/Surplus
      const tileW = (contentWidth - 12) / 4 // 4mm gap between tiles
      const tileH = 14
      const drawKPITile = (x: number, label: string, value: string, accentHex: [number, number, number]) => {
        pdf.setFillColor(248, 250, 252)
        pdf.roundedRect(x, creditY, tileW, tileH, 2, 2, 'F')
        pdf.setFillColor(accentHex[0], accentHex[1], accentHex[2])
        pdf.rect(x, creditY, 1.5, tileH, 'F')
        pdf.setFontSize(7)
        pdf.setTextColor(110, 110, 110)
        pdf.setFont('helvetica', 'normal')
        pdf.text(label.toUpperCase(), x + 4, creditY + 5)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(accentHex[0], accentHex[1], accentHex[2])
        pdf.text(value, x + 4, creditY + 11)
        pdf.setFont('helvetica', 'normal')
      }
      drawKPITile(margin, 'Expected Rent', formatAED(totalExpected), [13, 124, 61])
      drawKPITile(margin + (tileW + 4), 'Collected (Current Mth)', formatAED(totalCollected), [10, 92, 78])
      drawKPITile(margin + (tileW + 4) * 2, 'Remaining', formatAED(totalRemaining), [194, 65, 58])
      drawKPITile(margin + (tileW + 4) * 3, 'Advance / Surplus', formatAED(totalSurplus), [109, 109, 196])
      creditY += tileH + 6

      // Table header — column positions tuned for A4 portrait (210mm) with 15mm margins
      // Building name gets ~50mm; remaining/collected/expected get ~24mm each for "X,XXX,XXX AED"
      const colX = {
        idx: margin + 3,            // 18 — '#' column
        name: margin + 9,            // 24 — Building name (~50mm wide)
        units: margin + 60,          // 75 — Units count
        occ: margin + 72,            // 87 — Occupied count
        expected: margin + 84,       // 99 — Expected rent
        collected: margin + 114,     // 129 — Collected
        remaining: margin + 144,     // 159 — Remaining
        rate: margin + contentWidth - 4, // 191 right-aligned — Collection rate %
      }
      const drawBuildingTableHeader = (startY: number) => {
        pdf.setFillColor(13, 124, 61)
        pdf.rect(margin, startY, contentWidth, 8, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(7.5)
        pdf.setFont('helvetica', 'bold')
        pdf.text('#', colX.idx, startY + 5.5)
        pdf.text('Building', colX.name, startY + 5.5)
        pdf.text('Units', colX.units, startY + 5.5)
        pdf.text('Occupied', colX.occ, startY + 5.5)
        pdf.text('Expected (AED)', colX.expected, startY + 5.5)
        pdf.text('Collected (AED)', colX.collected, startY + 5.5)
        pdf.text('Remaining (AED)', colX.remaining, startY + 5.5)
        pdf.text('Rate %', colX.rate, startY + 5.5, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        return startY + 8
      }
      creditY = drawBuildingTableHeader(creditY)

      // Building rows
      for (let i = 0; i < buildingPerf.length; i++) {
        if (creditY > pageHeight - 30) {
          pdf.addPage()
          creditY = 18
          pdf.setFillColor(13, 124, 61)
          pdf.rect(0, 0, pageWidth, 14, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.text('Al Reef Al Madeena', margin, 9)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.text(`Building Performance (cont.) — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
          creditY = 22
          creditY = drawBuildingTableHeader(creditY)
        }
        const b = buildingPerf[i]
        // Rows with surplus need 9mm height (extra line for "+X advance" indicator)
        const rowH = b.surplus > 0 ? 9 : 7
        const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
        pdf.setFillColor(rowBg)
        pdf.rect(margin, creditY, contentWidth, rowH, 'F')

        // Collection-rate color stripe on left of row
        let stripe: [number, number, number]
        if (b.collectionRate >= 80) stripe = [13, 124, 61]      // green
        else if (b.collectionRate >= 50) stripe = [197, 160, 40] // amber
        else stripe = [194, 65, 58]                              // red
        pdf.setFillColor(stripe[0], stripe[1], stripe[2])
        pdf.rect(margin, creditY, 1.2, rowH, 'F')

        const textY = creditY + 5
        pdf.setFontSize(7.5)
        pdf.setTextColor(40, 40, 40)
        pdf.text(String(i + 1), colX.idx, textY)
        const nameStr = b.name.length > 28 ? b.name.substring(0, 27) + '…' : b.name
        pdf.text(nameStr, colX.name, textY)
        pdf.text(String(b.totalUnits), colX.units, textY)
        pdf.text(String(b.occupied), colX.occ, textY)
        pdf.text(formatAED(b.expected), colX.expected, textY)
        pdf.setTextColor(13, 124, 61)
        pdf.text(formatAED(b.collected), colX.collected, textY)
        // Remaining in red if > 0, otherwise muted
        if (b.remaining > 0) {
          pdf.setTextColor(194, 65, 58)
        } else {
          pdf.setTextColor(110, 110, 110)
        }
        pdf.text(formatAED(b.remaining), colX.remaining, textY)
        // Rate % badge style — colored text
        pdf.setTextColor(stripe[0], stripe[1], stripe[2])
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${b.collectionRate}%`, colX.rate, textY, { align: 'right' })
        pdf.setFont('helvetica', 'normal')

        // Surplus indicator — show "+X AED advance" below the rate when surplus > 0
        // This makes it clear why a building with advance payments still shows < 100% rate
        if (b.surplus > 0) {
          pdf.setFontSize(6)
          pdf.setTextColor(109, 109, 196) // muted indigo for "advance" flag
          pdf.setFont('helvetica', 'italic')
          pdf.text(`+${formatAED(b.surplus)} advance`, colX.rate, textY + 3.5, { align: 'right' })
          pdf.setFont('helvetica', 'normal')
        }
        creditY += rowH
      }

      // TOTAL row
      if (creditY > pageHeight - 25) { pdf.addPage(); creditY = 22 }
      pdf.setFillColor(232, 245, 233)
      pdf.rect(margin, creditY, contentWidth, 8, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text('PORTFOLIO TOTAL', colX.name, creditY + 5.5)
      pdf.text(String(totalUnitsAll), colX.units, creditY + 5.5)
      pdf.text(String(totalOccupiedAll), colX.occ, creditY + 5.5)
      pdf.text(formatAED(totalExpected), colX.expected, creditY + 5.5)
      pdf.text(formatAED(totalCollected), colX.collected, creditY + 5.5)
      pdf.setTextColor(194, 65, 58)
      pdf.text(formatAED(totalRemaining), colX.remaining, creditY + 5.5)
      pdf.setTextColor(13, 124, 61)
      pdf.text(`${overallRate}%`, colX.rate, creditY + 5.5, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      creditY += 11

      // Methodology footnote
      if (totalSurplus > 0) {
        if (creditY > pageHeight - 20) { pdf.addPage(); creditY = 22 }
        pdf.setFontSize(6.5)
        pdf.setTextColor(120, 120, 120)
        pdf.setFont('helvetica', 'italic')
        pdf.text(
          `Note: ${formatAED(totalSurplus)} in advance/historical payments received this month is excluded from collection rate (counted as tenant credit). Total cash received: ${formatAED(totalRawCollected)}.`,
          margin, creditY, { maxWidth: contentWidth },
        )
        pdf.setFont('helvetica', 'normal')
        creditY += 6
      }

      // ── Payment Method Summary box (kept) ──
      const monthMethodTotals: Record<string, number> = {}
      for (const p of consolidatedMonthlyItems) {
        let method = (p.method || 'other').toLowerCase()
        if (method === 'bank_transfer') method = 'transfer'
        monthMethodTotals[method] = (monthMethodTotals[method] || 0) + p.amount
      }
      const mTotalCash = monthMethodTotals['cash'] || 0
      const mTotalBankTransfer = monthMethodTotals['transfer'] || 0
      const mTotalCheque = monthMethodTotals['cheque'] || 0

      if (creditY > pageHeight - 35) { pdf.addPage(); creditY = 22 }
      pdf.setFillColor(245, 253, 244)
      pdf.roundedRect(margin, creditY, contentWidth, 26, 3, 3, 'F')
      pdf.setFillColor(13, 124, 61)
      pdf.rect(margin, creditY, contentWidth, 3, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text(t('paymentMethodSummary', lang), margin + 4, creditY + 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(40, 40, 40)
      pdf.text(`${t('totalCashPayments', lang)}:`, margin + 8, creditY + 14)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(mTotalCash), margin + 55, creditY + 14)
      pdf.setTextColor(40, 40, 40)
      pdf.text(`${t('totalBankTransferPayments', lang)}:`, margin + 8, creditY + 19)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(mTotalBankTransfer), margin + 55, creditY + 19)
      pdf.setTextColor(40, 40, 40)
      pdf.text(`${t('totalChequePayments', lang)}:`, margin + 8, creditY + 24)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(mTotalCheque), margin + 55, creditY + 24)
      creditY += 30

      // ── Page: Profit & Loss Statement + Expense Breakdown ──
      pdf.addPage()
      let plY = 18
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pageWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Al Reef Al Madeena', margin, 9)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(`Profit & Loss — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
      plY = 22

      // Section title
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Profit & Loss Statement', margin, plY)
      plY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Revenue, adjustments, vacancy and bad debt flowing through to net income for the month.', margin, plY)
      plY += 7

      // P&L items in a styled table-like layout
      const plItems: Array<[string, string, 'normal' | 'bold' | 'green' | 'red']> = [
        [t('rentalIncome', lang), formatAED(data.rentalIncome), 'normal'],
        [t('otherIncome', lang), formatAED(data.otherIncome), 'normal'],
        [t('grossRevenue', lang), formatAED(data.grossRevenue), 'bold'],
        [t('adjustmentsTotal', lang), `-${formatAED(data.adjustmentTotal)}`, 'red'],
        [t('netRevenue', lang), formatAED(data.netRevenue), data.netRevenue >= 0 ? 'green' : 'red'],
        [t('vacancyLoss', lang), `-${formatAED(data.vacancyLoss)}`, 'red'],
        [t('badDebt', lang), `-${formatAED(data.badDebt)}`, 'red'],
        [t('grossProfit', lang), formatAED(data.grossProfit), data.grossProfit >= 0 ? 'green' : 'red'],
        [t('operatingExpenses', lang), `-${formatAED(data.costOfOperations)}`, 'red'],
        [t('netIncome', lang), formatAED(data.netIncome), data.netIncome >= 0 ? 'green' : 'red'],
      ]
      // P&L box
      const plBoxH = plItems.length * 6.5 + 8
      pdf.setFillColor(248, 250, 252)
      pdf.roundedRect(margin, plY, contentWidth, plBoxH, 2, 2, 'F')
      pdf.setFillColor(13, 124, 61)
      pdf.rect(margin, plY, 1.5, plBoxH, 'F')
      let plRowY = plY + 6
      plItems.forEach(([label, value, style]) => {
        const isBold = style === 'bold'
        const color: [number, number, number] = style === 'red' ? [194, 65, 58]
          : style === 'green' ? [13, 124, 61]
          : isBold ? [13, 124, 61]
          : [40, 40, 40]
        pdf.setFontSize(9)
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal')
        pdf.setTextColor(color[0], color[1], color[2])
        pdf.text(label, margin + 5, plRowY)
        pdf.text(value, margin + contentWidth - 5, plRowY, { align: 'right' })
        // Subtle separator under bold rows
        if (isBold) {
          pdf.setDrawColor(220, 220, 220)
          pdf.setLineWidth(0.2)
          pdf.line(margin + 3, plRowY + 2, margin + contentWidth - 3, plRowY + 2)
        }
        plRowY += 6.5
      })
      plY = plY + plBoxH + 8

      // Expense breakdown
      if (plY > pageHeight - 60) { pdf.addPage(); plY = 22 }
      pdf.setFontSize(12)
      pdf.setTextColor(13, 124, 61)
      pdf.setFont('helvetica', 'bold')
      pdf.text(t('expenseBreakdown', lang), margin, plY)
      plY += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Operating expenses grouped by category.', margin, plY)
      plY += 6

      // Expense breakdown table
      const expBoxW = contentWidth
      const expEntries = Object.entries(data.expenseBreakdown).sort((a, b) => (b[1] as number) - (a[1] as number))
      const expTotal = expEntries.reduce((s, [, v]) => s + (v as number), 0)
      const expRows = expEntries.length
      const expBoxH = expRows * 7 + 14 // header + total
      pdf.setFillColor(248, 250, 252)
      pdf.roundedRect(margin, plY, expBoxW, expBoxH, 2, 2, 'F')
      pdf.setFillColor(13, 124, 61)
      pdf.rect(margin, plY, expBoxW, 1.2, 'F')
      // Header
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(13, 124, 61)
      pdf.text(t('expenseCategory', lang), margin + 5, plY + 7)
      pdf.text(t('amount', lang), margin + expBoxW * 0.7, plY + 7)
      pdf.text('Share %', margin + expBoxW - 5, plY + 7, { align: 'right' })
      pdf.setDrawColor(220, 220, 220)
      pdf.setLineWidth(0.2)
      pdf.line(margin + 3, plY + 10, margin + expBoxW - 3, plY + 10)
      let expRowY = plY + 15
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
      expEntries.forEach(([key, value], i) => {
        const v = value as number
        const sharePct = expTotal > 0 ? Math.round((v / expTotal) * 100) : 0
        // Subtle zebra striping
        if (i % 2 === 1) {
          pdf.setFillColor(255, 255, 255)
          pdf.rect(margin + 2, expRowY - 4, expBoxW - 4, 6, 'F')
        }
        pdf.setTextColor(40, 40, 40)
        pdf.text(getExpenseCategoryLabelExport(key), margin + 5, expRowY)
        pdf.setTextColor(194, 65, 58)
        pdf.text(formatAED(v), margin + expBoxW * 0.7, expRowY)
        pdf.setTextColor(110, 110, 110)
        pdf.text(`${sharePct}%`, margin + expBoxW - 5, expRowY, { align: 'right' })
        expRowY += 7
      })
      // Total row
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin + 3, expRowY - 1, margin + expBoxW - 3, expRowY - 1)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(13, 124, 61)
      pdf.text('TOTAL', margin + 5, expRowY + 3)
      pdf.text(formatAED(expTotal), margin + expBoxW * 0.7, expRowY + 3)
      pdf.text('100%', margin + expBoxW - 5, expRowY + 3, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      plY = plY + expBoxH + 8

      // ── Page 3: Reservations & Recurring Bills Overview ──
      pdf.addPage()
      let ovY = 18
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pageWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Al Reef Al Madeena', margin, 9)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(`Reservations & Recurring Bills — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
      ovY = 22

      // ─ Section A: Reservations Overview ─
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Reservations Overview', margin, ovY)
      ovY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Pipeline of reservation activity for the selected month.', margin, ovY)
      ovY += 6

      // Compute reservation metrics
      const allActiveRes = (allReservations || []).filter((r: any) => r.status !== 'cancelled' && !r.deletedAt)
      const newThisMonth = allActiveRes.filter((r: any) => {
        if (!r.reservationDate) return false
        const d = new Date(r.reservationDate)
        return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear
      }).length
      const depositsThisMonthArr = allActiveRes.filter((r: any) => {
        if (r.depositStatus !== 'paid' && r.depositStatus !== 'partial') return false
        const dateStr = r.depositPaymentDate || r.reservationDate
        if (!dateStr) return false
        const d = new Date(dateStr)
        return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear
      })
      const depositsCollectedAmount = depositsThisMonthArr.reduce((s: number, r: any) => s + (r.depositAmount || 0), 0)
      const pendingCount = allActiveRes.filter((r: any) => (r.status || '').toLowerCase() === 'pending').length
      const confirmedCount = allActiveRes.filter((r: any) => (r.status || '').toLowerCase() === 'confirmed').length
      const convertedCount = allActiveRes.filter((r: any) => (r.status || '').toLowerCase() === 'converted').length

      // 4-tile KPI strip for reservations
      const resTiles = [
        { label: 'New This Month', value: String(newThisMonth), accent: [13, 124, 61] as [number, number, number] },
        { label: 'Deposits Collected', value: formatAED(depositsCollectedAmount), accent: [10, 92, 78] as [number, number, number] },
        { label: 'Pending', value: String(pendingCount), accent: [197, 160, 40] as [number, number, number] },
        { label: 'Confirmed', value: String(confirmedCount), accent: [13, 124, 61] as [number, number, number] },
      ]
      const resTileW = (contentWidth - 12) / 4
      resTiles.forEach((tile, i) => {
        const x = margin + i * (resTileW + 4)
        pdf.setFillColor(248, 250, 252)
        pdf.roundedRect(x, ovY, resTileW, 16, 2, 2, 'F')
        pdf.setFillColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.rect(x, ovY, 1.5, 16, 'F')
        pdf.setFontSize(7)
        pdf.setTextColor(110, 110, 110)
        pdf.setFont('helvetica', 'normal')
        pdf.text(tile.label.toUpperCase(), x + 4, ovY + 5)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.text(tile.value, x + 4, ovY + 12)
        pdf.setFont('helvetica', 'normal')
      })
      ovY += 22

      // Reservations status mini-table
      pdf.setFontSize(8)
      pdf.setTextColor(40, 40, 40)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Converted to Tenants:`, margin, ovY + 4)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(13, 124, 61)
      pdf.text(String(convertedCount), margin + 50, ovY + 4)
      pdf.setTextColor(40, 40, 40)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Total Active Reservations:`, margin + 80, ovY + 4)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(13, 124, 61)
      pdf.text(String(allActiveRes.length), margin + 140, ovY + 4)
      ovY += 12

      // ─ Section B: Recurring Bills Overview ─
      if (ovY > pageHeight - 70) { pdf.addPage(); ovY = 22 }
      ovY += 4
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Recurring Bills Overview', margin, ovY)
      ovY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Utility & service bills — outstanding, paid and overdue for the month.', margin, ovY)
      ovY += 6

      // Recurring bills KPI strip (4 tiles)
      const rbTotalOutstanding = recurringBillsSummary?.totalOutstanding ?? 0
      const rbPaidThisMonth = recurringBillsSummary?.totalPaidThisMonth ?? 0
      const rbTotalBills = recurringBillsSummary?.totalBills ?? 0
      const rbOverdueCount = recurringBillsSummary?.overdueCount ?? 0
      const rbTiles = [
        { label: 'Total Bills', value: String(rbTotalBills), accent: [13, 124, 61] as [number, number, number] },
        { label: 'Paid This Month', value: formatAED(rbPaidThisMonth), accent: [10, 92, 78] as [number, number, number] },
        { label: 'Outstanding', value: formatAED(rbTotalOutstanding), accent: [197, 160, 40] as [number, number, number] },
        { label: 'Overdue', value: String(rbOverdueCount), accent: [194, 65, 58] as [number, number, number] },
      ]
      rbTiles.forEach((tile, i) => {
        const x = margin + i * (resTileW + 4)
        pdf.setFillColor(248, 250, 252)
        pdf.roundedRect(x, ovY, resTileW, 16, 2, 2, 'F')
        pdf.setFillColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.rect(x, ovY, 1.5, 16, 'F')
        pdf.setFontSize(7)
        pdf.setTextColor(110, 110, 110)
        pdf.setFont('helvetica', 'normal')
        pdf.text(tile.label.toUpperCase(), x + 4, ovY + 5)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.text(tile.value, x + 4, ovY + 12)
        pdf.setFont('helvetica', 'normal')
      })
      ovY += 22

      // Recurring bills mini-table by service type (if available)
      const breakdown: Array<{ serviceType: string; count: number; totalOutstanding: number }> | undefined =
        recurringBillsSummary?.serviceTypeBreakdown
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        if (ovY > pageHeight - 40) { pdf.addPage(); ovY = 22 }
        pdf.setFontSize(10)
        pdf.setTextColor(13, 124, 61)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Outstanding by Service Type', margin, ovY)
        ovY += 6
        // header
        pdf.setFillColor(13, 124, 61)
        pdf.rect(margin, ovY, contentWidth, 7, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(7.5)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Service Type', margin + 3, ovY + 5)
        pdf.text('Bills', margin + 100, ovY + 5)
        pdf.text('Outstanding (AED)', pageWidth - margin - 3, ovY + 5, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        ovY += 7
        breakdown
          .slice()
          .sort((a, b) => (b.totalOutstanding || 0) - (a.totalOutstanding || 0))
          .forEach((row, i) => {
            if (ovY > pageHeight - 25) { pdf.addPage(); ovY = 22 }
            const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
            pdf.setFillColor(bg)
            pdf.rect(margin, ovY, contentWidth, 6.5, 'F')
            pdf.setTextColor(40, 40, 40)
            pdf.setFontSize(7.5)
            const stLabel = (row.serviceType || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            pdf.text(stLabel.substring(0, 40), margin + 3, ovY + 4.5)
            pdf.text(String(row.count || 0), margin + 100, ovY + 4.5)
            pdf.setTextColor(197, 160, 40)
            pdf.text(formatAED(row.totalOutstanding || 0), pageWidth - margin - 3, ovY + 4.5, { align: 'right' })
            ovY += 6.5
          })
      }

      // ─ Section C: Bills vs Tenant Payments — Net Cash Position ─
      if (ovY > pageHeight - 60) { pdf.addPage(); ovY = 22 }
      ovY += 4
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Bills vs Tenant Payments', margin, ovY)
      ovY += 5
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(110, 110, 110)
      pdf.text('Cash inflow from tenants versus cash outflow for recurring bills this month.', margin, ovY)
      ovY += 6

      // Compute tenant payments collected this month (rent only — excludes reservation deposits already shown)
      const tenantPaymentsThisMonth = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)
      const billsPaidThisMonth = rbPaidThisMonth
      const netCashFlow = tenantPaymentsThisMonth - billsPaidThisMonth

      // 3-tile KPI strip
      const bvtTiles = [
        { label: 'Tenant Payments', value: formatAED(tenantPaymentsThisMonth), accent: [13, 124, 61] as [number, number, number] },
        { label: 'Bills Paid', value: formatAED(billsPaidThisMonth), accent: [194, 65, 58] as [number, number, number] },
        { label: 'Net Cash Flow', value: formatAED(netCashFlow), accent: netCashFlow >= 0 ? [10, 92, 78] as [number, number, number] : [197, 160, 40] as [number, number, number] },
      ]
      const bvtTileW = (contentWidth - 8) / 3
      bvtTiles.forEach((tile, i) => {
        const x = margin + i * (bvtTileW + 4)
        pdf.setFillColor(248, 250, 252)
        pdf.roundedRect(x, ovY, bvtTileW, 16, 2, 2, 'F')
        pdf.setFillColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.rect(x, ovY, 1.5, 16, 'F')
        pdf.setFontSize(7)
        pdf.setTextColor(110, 110, 110)
        pdf.setFont('helvetica', 'normal')
        pdf.text(tile.label.toUpperCase(), x + 4, ovY + 5)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(tile.accent[0], tile.accent[1], tile.accent[2])
        pdf.text(tile.value, x + 4, ovY + 12)
        pdf.setFont('helvetica', 'normal')
      })
      ovY += 22

      // Simple comparison bar (visual)
      const totalFlow = tenantPaymentsThisMonth + billsPaidThisMonth
      const barX = margin
      const barW = contentWidth
      const barH = 8
      const inflowPct = totalFlow > 0 ? (tenantPaymentsThisMonth / totalFlow) * 100 : 0
      // Background
      pdf.setFillColor(233, 233, 233)
      pdf.roundedRect(barX, ovY, barW, barH, 1.5, 1.5, 'F')
      // Inflow (tenant payments) portion — green
      pdf.setFillColor(13, 124, 61)
      pdf.roundedRect(barX, ovY, Math.max(0.5, barW * inflowPct / 100), barH, 1.5, 1.5, 'F')
      // Labels
      pdf.setFontSize(7.5)
      pdf.setTextColor(13, 124, 61)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Inflow ${Math.round(inflowPct)}%`, barX + 3, ovY + barH + 4)
      pdf.setTextColor(194, 65, 58)
      pdf.text(`Outflow ${Math.round(100 - inflowPct)}%`, barX + barW - 3, ovY + barH + 4, { align: 'right' })
      pdf.setFont('helvetica', 'normal')

      // ── Page: Charts (each chart on its own page, aspect ratio preserved) ──
      // Note: html2canvas captures the chart at its rendered pixel size. We compute the
      // placement width/height preserving the canvas aspect ratio and clamp by MAX height
      // so charts never get stretched or squashed. Each chart gets its own dedicated page.

      // Helper: render a single chart on its own page with title bar
      const renderChartOnOwnPage = async (
        ref: RefObject<HTMLDivElement | null>,
        title: string,
        maxH: number,
      ) => {
        if (!ref.current) return
        let canvas: HTMLCanvasElement
        try {
          canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff', logging: false })
        } catch {
          return // skip if capture fails
        }
        const imgData = canvas.toDataURL('image/png')
        pdf.addPage()
        // Title bar
        pdf.setFillColor(13, 124, 61)
        pdf.rect(0, 0, pageWidth, 15, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text(title, pageWidth / 2, 10, { align: 'center' })
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(0, 0, 0)

        // Compute placement preserving aspect ratio
        const canvasRatio = canvas.height / canvas.width
        let placeW = contentWidth        // try full content width first
        let placeH = placeW * canvasRatio
        const maxPlaceH = maxH
        if (placeH > maxPlaceH) {
          // Clamp by height — recompute width to preserve aspect ratio
          placeH = maxPlaceH
          placeW = placeH / canvasRatio
          if (placeW > contentWidth) {
            placeW = contentWidth
            placeH = placeW * canvasRatio
          }
        }
        // Center horizontally
        const placeX = margin + (contentWidth - placeW) / 2
        const placeY = 22
        pdf.addImage(imgData, 'PNG', placeX, placeY, placeW, placeH)
      }

      // Bar chart — 6-month trend
      // Brief wait to ensure recharts have finished animating before snapshot
      await new Promise(resolve => setTimeout(resolve, 350))
      await renderChartOnOwnPage(barChartRef, `${t('sixMonthTrend', lang)} - ${monthName} ${selectedYear}`, 130)
      // Pie chart — payment method breakdown
      await renderChartOnOwnPage(pieChartRef, `${t('paymentMethodSummary', lang)} - ${monthName} ${selectedYear}`, 130)
      // Area chart — revenue analysis
      await renderChartOnOwnPage(areaChartRef, `${t('revenueAnalysis', lang)} - ${monthName} ${selectedYear}`, 150)

      // Footer on all pages
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(7)
        pdf.setTextColor(150, 150, 150)
        pdf.text(`Al Reef Al Madeena Real Estate | ${monthName} ${selectedYear} Report | Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
      }

      pdf.save(`Al_Reef_Report_${monthName}_${selectedYear}.pdf`)
      toast.success(t('exportSuccess', lang))
    } catch (error) {
      console.error('PDF Export failed:', error)
      toast.error(t('exportFailed', lang))
    } finally {
      setExportingPDF(false)
    }
  }, [selectedMonth, selectedYear, lang, data])

  const handleExportXLSX = useCallback(async () => {
    try {
      setExporting(true)
      const store = useDataStore.getState()
      const { tenants, payments, expenses, maintenanceItems, company, reservations, adjustments, tenantGroups } = store
      const properties = [...store.properties].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      const reportData = store.getReportData(selectedMonth, selectedYear)

      // Fetch additional datasets that aren't in the local store (cheques, recurring bills, bill payments)
      // These are fetched in parallel to keep the export fast.
      let cheques: any[] = []
      let recurringBills: any[] = []
      let billPayments: any[] = []
      try {
        const [chequesRes, billsRes, billPaymentsRes] = await Promise.all([
          fetch('/api/cheques?limit=1000'),
          fetch('/api/recurring-bills?limit=1000'),
          fetch('/api/recurring-bills/payments?limit=1000'),
        ])
        if (chequesRes.ok) {
          const j = await chequesRes.json()
          cheques = Array.isArray(j) ? j : (j.cheques || j.data || [])
        }
        if (billsRes.ok) {
          const j = await billsRes.json()
          recurringBills = Array.isArray(j) ? j : (j.bills || j.data || [])
        }
        if (billPaymentsRes.ok) {
          const j = await billPaymentsRes.json()
          billPayments = Array.isArray(j) ? j : (j.payments || j.data || [])
        }
      } catch (e) {
        console.warn('[XLSX EXPORT] Some optional datasets could not be fetched; continuing without them:', e)
      }

      const wb = XLSX.utils.book_new()

      // ── Sheet 1: Financial Summary ──
      const summaryData = [
        [`${company.name} - Financial Report`],
        [`${getMonthName(selectedMonth, 'en')} ${selectedYear}`],
        [],
        ['FINANCIAL SUMMARY', '', '', ''],
        ['Metric', 'Value (AED)', '', ''],
        ['Expected Revenue', reportData.expectedRevenue],
        ['Collected Revenue', reportData.totalRevenue],
        ['Total Expenses', reportData.totalExpenses],
        ['Profit / Loss', reportData.profitLoss],
        [],
        ['PROFIT & LOSS STATEMENT', '', '', ''],
        ['Rental Income', reportData.rentalIncome],
        ['Other Income', reportData.otherIncome],
        ['Gross Revenue', reportData.grossRevenue],
        ['Rent Adjustments', `-${reportData.adjustmentTotal}`],
        ['Net Revenue', reportData.netRevenue],
        ['Vacancy Loss', `-${reportData.vacancyLoss}`],
        ['Bad Debt / Unpaid', `-${reportData.badDebt}`],
        ['Gross Profit', reportData.grossProfit],
        ['Operating Expenses', `-${reportData.costOfOperations}`],
        ['Net Income', reportData.netIncome],
        [],
        ['KEY METRICS', '', '', ''],
        ['Collection Rate', `${reportData.collectionRate}%`],
        ['Occupancy Rate', `${reportData.occupancyRate}%`],
        ['Total Units', reportData.totalUnits],
        ['Occupied Units', reportData.occupiedUnits],
        ['Net Profit Margin', `${reportData.grossRevenue > 0 ? ((reportData.netIncome / reportData.grossRevenue) * 100).toFixed(1) : 0}%`],
        [],
        ['6-MONTH TREND', '', '', ''],
        ['Month', 'Revenue (AED)', 'Expenses (AED)', 'Profit (AED)'],
        ...reportData.trend.map(item => [
          `${getMonthName(item.month, 'en')} ${item.year}`,
          item.revenue,
          item.expenses,
          item.profit,
        ]),
        [],
        ['EXPENSE BREAKDOWN', '', '', ''],
        ['Category', 'Amount (AED)'],
        ...Object.entries(reportData.expenseBreakdown).map(([key, value]) => [
          getExpenseCategoryLabelExport(key),
          value,
        ]),
      ]
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Financial Summary')

      // ── Sheet 2: Properties (ALL fields A-Z) ──
      const propertiesHeader = [
        'Property ID', 'Property Name', 'Name (Arabic)', 'Name (Bengali)', 'Name (Urdu)',
        'Type', 'Address', 'Total Units', 'Floors',
        'Active Tenants', 'Vacant Units', 'Occupancy %',
        'Monthly Revenue (AED)', 'Annual Revenue (AED)',
        'Archived', 'Status', 'Created At',
      ]
      const propertiesRows = properties.map(p => {
        const activeTenantList = tenants.filter(t => t.propertyId === p.id && isFinanciallyActive(t.status))
        const occupancy = p.totalUnits > 0 ? Math.round((activeTenantList.length / p.totalUnits) * 100) : 0
        const monthlyRevenue = activeTenantList.reduce((sum, t) => sum + t.rentAmount, 0)
        return [
          p.id,
          p.name,
          p.nameAr || '',
          (p as any).nameBn || '',
          (p as any).nameUr || '',
          getPropertyTypeLabel(p.type),
          p.address || '',
          p.totalUnits,
          p.floors,
          activeTenantList.length,
          Math.max(0, p.totalUnits - activeTenantList.length),
          `${occupancy}%`,
          monthlyRevenue,
          monthlyRevenue * 12,
          p.archived ? 'Yes' : 'No',
          p.archived ? 'Archived' : 'Active',
          p.createdAt ? formatDate(p.createdAt) : '',
        ]
      })
      const wsProperties = XLSX.utils.aoa_to_sheet([propertiesHeader, ...propertiesRows])
      wsProperties['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsProperties, 'Properties')

      // ── Sheet 3: Tenants (ALL fields A-Z, including Phase 1 rental accounting) ──
      const tenantsHeader = [
        'Tenant ID', 'Tenant Name', 'Name (Arabic)', 'Name (Bengali)', 'Name (Urdu)',
        'Property', 'Unit Number', 'Unit Type', 'Floor', 'Size (sqft)',
        'Nationality', 'Phone', 'WhatsApp', 'Email', 'Emirates ID',
        'Employer', 'Emergency Contact',
        'Monthly Rent (AED)', 'Municipality Fee (AED)', 'Security Deposit (AED)',
        'Payment Method',
        'Lease Start', 'Lease End', 'Contract Duration (months)',
        'Renewal Status', 'New Rent (AED)',
        'Status', 'Moved Out At',
        'Late Payment Count', 'Tenant Score', 'System Score',
        'Manual Score Override', 'Manual Override Reason', 'Manual Override By', 'Manual Override At',
        'Opening Balance (AED)', 'Credit Balance (AED)',
        'Legal Case', 'Legal Case Number', 'Legal Case Notes',
        'Tenant Group', 'Notes',
        'Created At',
      ]
      const tenantsRows = tenants.map(tn => {
        const prop = properties.find(p => p.id === tn.propertyId)
        const group = (tenantGroups || []).find((g: any) => g.id === tn.groupId)
        return [
          tn.id,
          tn.name,
          tn.nameAr || '',
          (tn as any).nameBn || '',
          (tn as any).nameUr || '',
          prop?.name || '',
          tn.unitNumber || '',
          getUnitTypeLabel(tn.unitType),
          tn.floor || '',
          tn.sizeSqft || '',
          tn.nationality || '',
          tn.phone,
          tn.whatsapp || '',
          tn.email || '',
          tn.emiratesId || '',
          tn.employer || '',
          tn.emergencyContact || '',
          tn.rentAmount,
          tn.municipalityFee ?? 0,
          tn.securityDeposit || '',
          tn.paymentMethod || '',
          tn.leaseStart ? formatDate(tn.leaseStart) : '',
          tn.leaseEnd ? formatDate(tn.leaseEnd) : '',
          tn.contractDuration || '',
          tn.renewalStatus || '',
          tn.newRent || '',
          tn.status,
          tn.movedOutAt ? formatDate(tn.movedOutAt) : '',
          tn.latePaymentCount,
          tn.tenantScore,
          tn.systemScore ?? tn.tenantScore,
          tn.manualScoreOverride ?? '',
          tn.manualScoreReason ?? '',
          tn.manualOverrideBy ?? '',
          tn.manualOverrideAt ? formatDate(tn.manualOverrideAt) : '',
          tn.openingBalance ?? 0,
          tn.creditBalance ?? 0,
          tn.legalCase ? 'Yes' : 'No',
          tn.legalCaseNumber || '',
          tn.legalCaseNotes || '',
          group?.name || '',
          tn.notes || '',
          tn.createdAt ? formatDate(tn.createdAt) : '',
        ]
      })
      const wsTenants = XLSX.utils.aoa_to_sheet([tenantsHeader, ...tenantsRows])
      wsTenants['!cols'] = [
        { wch: 28 }, { wch: 24 }, { wch: 28 }, { wch: 22 }, { wch: 22 },
        { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
        { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 22 },
        { wch: 20 }, { wch: 20 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 14 },
        { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 14 },
        { wch: 16 }, { wch: 16 },
        { wch: 8 }, { wch: 18 }, { wch: 30 },
        { wch: 18 }, { wch: 30 },
        { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, wsTenants, 'Tenants')

      // ── Sheet 4: Payments ──
      // Consolidate linked-unit payments and sort by method priority
      const getMethodSortXlsx = (method: string | null): number => {
        switch ((method || '').toLowerCase()) {
          case 'cash': return 1
          case 'bank_transfer': case 'transfer': return 2
          case 'cheque': return 3
          default: return 4
        }
      }

      const paymentsHeader = [
        'Payment ID', 'Date', 'Tenant Name', 'Property', 'Unit(s)', 'Month', 'Year',
        'Amount (AED)', 'Method', 'Reference', 'Receipt Number',
        'Late?', 'Days Late', 'Allocation Type', 'Grouping', 'Notes', 'Created At',
      ]

      // Build payment entries, consolidating linked-unit payments
      const xlsxPaymentEntries: any[][] = []
      const xlsxGroupBuckets = new Map<string, PaymentData[]>()

      for (const p of payments) {
        const tenant = tenants.find(tn => tn.id === p.tenantId)
        if (tenant?.groupId) {
          const key = `${tenant.groupId}|${p.method || 'none'}|${p.reference || 'none'}|${new Date(p.date).toISOString().split('T')[0]}`
          if (!xlsxGroupBuckets.has(key)) xlsxGroupBuckets.set(key, [])
          xlsxGroupBuckets.get(key)!.push(p)
        }
      }

      const groupedPaymentIds = new Set<string>()
      for (const [, groupPayments] of xlsxGroupBuckets) {
        if (groupPayments.length > 1) {
          // Consolidated entry
          const firstPayment = groupPayments[0]
          const firstTenant = tenants.find(tn => tn.id === firstPayment.tenantId)!
          const prop = properties.find(pr => pr.id === firstTenant.propertyId)
          const tenantGroup = (tenantGroups || []).find((g: any) => g.id === firstTenant.groupId)
          const totalAmount = groupPayments.reduce((sum, p) => sum + p.amount, 0)
          const unitNumbers = groupPayments.map(p => {
            const t = tenants.find(tn => tn.id === p.tenantId)
            return t?.unitNumber || ''
          }).filter(Boolean).join(', ')
          const maxDaysLate = Math.max(...groupPayments.map(p => p.daysLate || 0))
          const allocationTypes = [...new Set(groupPayments.map(p => p.allocationType || '').filter(Boolean))].join(', ')
          const paymentIds = groupPayments.map(p => p.id).join(', ')

          xlsxPaymentEntries.push([
            paymentIds,
            formatDate(firstPayment.date),
            tenantGroup ? tenantGroup.name : firstTenant.name,
            prop?.name || '',
            unitNumbers,
            getMonthName(firstPayment.month, 'en'),
            firstPayment.year,
            totalAmount,
            firstPayment.method || '',
            firstPayment.reference || '',
            firstPayment.receiptNumber || '',
            groupPayments.some(p => p.isLate) ? 'Yes' : 'No',
            maxDaysLate,
            allocationTypes || '',
            'Consolidated (Linked Units)',
            firstPayment.notes || '',
            firstPayment.createdAt ? formatDate(firstPayment.createdAt) : '',
          ])
          groupPayments.forEach(p => groupedPaymentIds.add(p.id))
        } else {
          // Single entry from a group tenant — just add individually
          groupedPaymentIds.add(groupPayments[0].id)
          const p = groupPayments[0]
          const tenant = tenants.find(tn => tn.id === p.tenantId)
          const prop = tenant ? properties.find(pr => pr.id === tenant.propertyId) : null
          xlsxPaymentEntries.push([
            p.id,
            formatDate(p.date),
            tenant?.name || '',
            prop?.name || '',
            tenant?.unitNumber || '',
            getMonthName(p.month, 'en'),
            p.year,
            p.amount,
            p.method || '',
            p.reference || '',
            p.receiptNumber || '',
            p.isLate ? 'Yes' : 'No',
            p.daysLate,
            p.allocationType || '',
            'Single Unit',
            p.notes || '',
            p.createdAt ? formatDate(p.createdAt) : '',
          ])
        }
      }

      // Add non-grouped payments
      for (const p of payments) {
        if (groupedPaymentIds.has(p.id)) continue
        const tenant = tenants.find(tn => tn.id === p.tenantId)
        const prop = tenant ? properties.find(pr => pr.id === tenant.propertyId) : null
        xlsxPaymentEntries.push([
          p.id,
          formatDate(p.date),
          tenant?.name || '',
          prop?.name || '',
          tenant?.unitNumber || '',
          getMonthName(p.month, 'en'),
          p.year,
          p.amount,
          p.method || '',
          p.reference || '',
          p.receiptNumber || '',
          p.isLate ? 'Yes' : 'No',
          p.daysLate,
          p.allocationType || '',
          'Single Unit',
          p.notes || '',
          p.createdAt ? formatDate(p.createdAt) : '',
        ])
      }

      // Sort by method priority, then by date
      xlsxPaymentEntries.sort((a, b) => {
        const methodDiff = getMethodSortXlsx(a[8] as string) - getMethodSortXlsx(b[8] as string)
        if (methodDiff !== 0) return methodDiff
        return new Date(b[1] as string).getTime() - new Date(a[1] as string).getTime()
      })

      const wsPayments = XLSX.utils.aoa_to_sheet([paymentsHeader, ...xlsxPaymentEntries])
      wsPayments['!cols'] = [
        { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 8 },
        { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 18 },
        { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments')

      // ── Sheet 5: Expenses (ALL fields A-Z) ──
      const expensesHeader = [
        'Expense ID', 'Date', 'Category', 'Description', 'Amount (AED)',
        'Vendor', 'Invoice Number', 'Building', 'Recurring', 'Created At',
      ]
      const expensesRows = expenses
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(e => [
          e.id,
          formatDate(e.date),
          getExpenseCategoryLabelExport(e.category),
          e.description,
          e.amount,
          e.vendor || '',
          e.invoiceNumber || '',
          e.building || '',
          e.recurring ? 'Yes' : 'No',
          e.createdAt ? formatDate(e.createdAt) : '',
        ])
      const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesRows])
      wsExpenses['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses')

      // ── Sheet 6: Maintenance (ALL fields A-Z) ──
      const maintenanceHeader = [
        'Maintenance ID', 'Title', 'Category', 'Priority', 'Status', 'Property',
        'Vendor', 'Estimated Cost (AED)', 'Actual Cost (AED)',
        'Description', 'Date Created', 'Date Completed',
      ]
      const maintenanceRows = maintenanceItems.map(m => {
        const prop = properties.find(p => p.id === m.propertyId)
        return [
          m.id,
          m.title,
          getMaintenanceCategoryLabelExport(m.category),
          m.priority,
          m.status,
          prop?.name || '',
          m.vendor || '',
          m.estimatedCost || '',
          m.actualCost || '',
          m.description,
          formatDate(m.createdAt),
          m.completedAt ? formatDate(m.completedAt) : '',
        ]
      })
      const wsMaintenance = XLSX.utils.aoa_to_sheet([maintenanceHeader, ...maintenanceRows])
      wsMaintenance['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsMaintenance, 'Maintenance')

      // ── Sheet 7: Reservations (ALL fields A-Z) ──
      const reservationHeader = [
        'Reservation ID', 'Prospect Name', 'Prospect Name (Arabic)',
        'Property', 'Unit', 'Prospect Phone', 'Prospect WhatsApp', 'Prospect Email',
        'Reservation Date', 'Expected Move-In Date', 'Expiry Date',
        'Deposit Amount (AED)', 'Deposit Status', 'Payment Method', 'Payment Reference', 'Payment Date',
        'Status', 'Emirates ID', 'Converted To Tenant', 'Notes', 'Created At',
      ]
      const reservationRows = (reservations || [])
        .filter((r: any) => !r.deletedAt)
        .map((r: any) => {
          const prop = properties.find((p: any) => p.id === r.propertyId)
          const paymentDate = r.depositPaymentDate
            ? formatDate(r.depositPaymentDate)
            : r.reservationDate
              ? formatDate(r.reservationDate)
              : ''
          return [
            r.id || '',
            r.prospectName || '',
            r.prospectNameAr || '',
            prop?.name || '',
            r.unitNumber || '',
            r.prospectPhone || '',
            r.prospectWhatsapp || '',
            r.prospectEmail || '',
            r.reservationDate ? formatDate(r.reservationDate) : '',
            r.expectedMoveInDate ? formatDate(r.expectedMoveInDate) : '',
            r.expiryDate ? formatDate(r.expiryDate) : '',
            r.depositAmount || 0,
            r.depositStatus || '',
            r.depositPaymentMethod || '',
            r.depositReference || '',
            paymentDate,
            r.status || '',
            r.emiratesId || '',
            r.convertedTenantId ? 'Yes' : 'No',
            r.notes || '',
            r.createdAt ? formatDate(r.createdAt) : '',
          ]
        })
      const wsReservations = XLSX.utils.aoa_to_sheet([reservationHeader, ...reservationRows])
      wsReservations['!cols'] = [
        { wch: 28 }, { wch: 24 }, { wch: 24 },
        { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 24 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
        { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, wsReservations, 'Reservations')

      // ── Sheet 8: Cheques (outgoing cheques to property owners — ALL fields) ──
      const chequesHeader = [
        'Cheque ID', 'Property', 'Payee Name', 'Payee Mobile',
        'Amount (AED)', 'Due Date', 'Cheque Number', 'Bank Name',
        'Status', 'Paid Date', 'Notes', 'Created At', 'Updated At',
      ]
      const chequesRows = (cheques || [])
        .filter((c: any) => !c.deletedAt)
        .sort((a: any, b: any) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
        .map((c: any) => {
          const prop = properties.find(p => p.id === c.propertyId)
          return [
            c.id || '',
            prop?.name || '',
            c.payeeName || '',
            c.payeeMobile || '',
            c.amount || 0,
            c.dueDate ? formatDate(c.dueDate) : '',
            c.chequeNumber || '',
            c.bankName || '',
            c.status || '',
            c.paidDate ? formatDate(c.paidDate) : '',
            c.notes || '',
            c.createdAt ? formatDate(c.createdAt) : '',
            c.updatedAt ? formatDate(c.updatedAt) : '',
          ]
        })
      if (chequesRows.length > 0) {
        const wsCheques = XLSX.utils.aoa_to_sheet([chequesHeader, ...chequesRows])
        wsCheques['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsCheques, 'Cheques (Outgoing)')
      }

      // ── Sheet 9: Recurring Bills (utilities & services — ALL fields) ──
      const recurringBillsHeader = [
        'Bill ID', 'Property', 'Provider Name', 'Service Type',
        'Account Number', 'Contract Number', 'Building Name', 'Owner Name', 'Property Manager',
        'Current Outstanding (AED)', 'Previous Outstanding (AED)', 'Total Amount Due (AED)',
        'Last Payment Amount (AED)', 'Last Payment Date',
        'Next Due Date', 'Billing Frequency', 'Auto Renew', 'Grace Period (days)',
        'Status', 'Notes', 'Created At', 'Updated At',
      ]
      const recurringBillsRows = (recurringBills || [])
        .filter((b: any) => !b.deletedAt)
        .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
        .map((b: any) => {
          const prop = properties.find(p => p.id === b.propertyId)
          return [
            b.id || '',
            prop?.name || '',
            b.providerName || '',
            b.serviceType || '',
            b.accountNumber || '',
            b.contractNumber || '',
            b.buildingName || '',
            b.ownerName || '',
            b.propertyManager || '',
            b.currentOutstanding || 0,
            b.previousOutstanding || 0,
            b.totalAmountDue || 0,
            b.lastPaymentAmount || '',
            b.lastPaymentDate ? formatDate(b.lastPaymentDate) : '',
            b.nextDueDate ? formatDate(b.nextDueDate) : '',
            b.billingFrequency || '',
            b.autoRenew ? 'Yes' : 'No',
            b.gracePeriodDays ?? '',
            b.status || '',
            b.notes || '',
            b.createdAt ? formatDate(b.createdAt) : '',
            b.updatedAt ? formatDate(b.updatedAt) : '',
          ]
        })
      if (recurringBillsRows.length > 0) {
        const wsRecurring = XLSX.utils.aoa_to_sheet([recurringBillsHeader, ...recurringBillsRows])
        wsRecurring['!cols'] = [
          { wch: 28 }, { wch: 22 }, { wch: 24 }, { wch: 18 },
          { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
          { wch: 18 }, { wch: 18 }, { wch: 18 },
          { wch: 18 }, { wch: 14 },
          { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
          { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
        ]
        XLSX.utils.book_append_sheet(wb, wsRecurring, 'Recurring Bills')
      }

      // ── Sheet 10: Bill Payments (utility bill payment history — ALL fields) ──
      const billPaymentsHeader = [
        'Bill Payment ID', 'Recurring Bill', 'Provider', 'Service Type',
        'Amount (AED)', 'Payment Date', 'Payment Method', 'Reference',
        'Outstanding Before (AED)', 'Outstanding After (AED)',
        'Notes', 'Created At',
      ]
      const billPaymentsRows = (billPayments || [])
        .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
        .map((bp: any) => {
          const bill = (recurringBills || []).find((b: any) => b.id === bp.recurringBillId)
          return [
            bp.id || '',
            bill ? bill.id : '',
            bill?.providerName || '',
            bill?.serviceType || '',
            bp.amount || 0,
            bp.paymentDate ? formatDate(bp.paymentDate) : '',
            bp.paymentMethod || '',
            bp.reference || '',
            bp.outstandingBefore ?? '',
            bp.outstandingAfter ?? '',
            bp.notes || '',
            bp.createdAt ? formatDate(bp.createdAt) : '',
          ]
        })
      if (billPaymentsRows.length > 0) {
        const wsBillPayments = XLSX.utils.aoa_to_sheet([billPaymentsHeader, ...billPaymentsRows])
        wsBillPayments['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsBillPayments, 'Bill Payments')
      }

      // ── Sheet 11: Rent Adjustments (ALL fields) ──
      const adjustmentsHeader = [
        'Adjustment ID', 'Tenant', 'Property', 'Amount (AED)', 'Adjustment Type',
        'Reason', 'Notes', 'Effective Month', 'Effective Year', 'Duration (months)',
        'Status', 'Created By', 'Created At', 'Updated At',
      ]
      const adjustmentsRows = (adjustments || [])
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((a: any) => {
          const tenant = tenants.find(tn => tn.id === a.tenantId)
          const prop = properties.find(p => p.id === a.propertyId)
          return [
            a.id || '',
            tenant?.name || '',
            prop?.name || '',
            a.amount || 0,
            a.adjustmentType || '',
            a.reason || '',
            a.notes || '',
            a.effectiveMonth || '',
            a.effectiveYear || '',
            a.durationMonths ?? '',
            a.status || '',
            a.createdBy || '',
            a.createdAt ? formatDate(a.createdAt) : '',
            a.updatedAt ? formatDate(a.updatedAt) : '',
          ]
        })
      if (adjustmentsRows.length > 0) {
        const wsAdjustments = XLSX.utils.aoa_to_sheet([adjustmentsHeader, ...adjustmentsRows])
        wsAdjustments['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsAdjustments, 'Rent Adjustments')
      }

      // ── Sheet 12: Tenant Groups (ALL fields) ──
      const groupsHeader = [
        'Group ID', 'Group Name', 'Name (Arabic)', 'Property', 'Billing Mode',
        'Status', 'Notes', 'Tenant Count', 'Created At', 'Updated At',
      ]
      const groupsRows = (tenantGroups || [])
        .filter((g: any) => !g.deletedAt)
        .map((g: any) => {
          const prop = properties.find(p => p.id === g.propertyId)
          const tenantCount = tenants.filter(tn => tn.groupId === g.id).length
          return [
            g.id || '',
            g.name || '',
            g.nameAr || '',
            prop?.name || '',
            g.billingMode || '',
            g.status || '',
            g.notes || '',
            tenantCount,
            g.createdAt ? formatDate(g.createdAt) : '',
            g.updatedAt ? formatDate(g.updatedAt) : '',
          ]
        })
      if (groupsRows.length > 0) {
        const wsGroups = XLSX.utils.aoa_to_sheet([groupsHeader, ...groupsRows])
        wsGroups['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsGroups, 'Tenant Groups')
      }

      // Generate and download
      const fileName = `Al_Reef_Report_${getMonthName(selectedMonth, 'en')}_${selectedYear}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success(t('exportSuccess', lang))
    } catch (error) {
      console.error('Export failed:', error)
      toast.error(t('exportFailed', lang))
    } finally {
      setExporting(false)
    }
  }, [selectedMonth, selectedYear, lang])

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-emerald" /></div>
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <ShieldAlert className="w-12 h-12 text-terracotta" />
        <h2 className="text-xl font-bold">{t('accessDenied', lang)}</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">{t('financialDataProtected', lang)}</p>
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-12 text-muted-foreground">{t('noData', lang)}</div>
  }

  const expensePieData = Object.entries(data.expenseBreakdown).map(([key, value]) => ({
    name: getExpenseCategoryLabel(key, lang),
    value,
  }))

  const trendChartData = data.trend.map(item => ({
    month: getMonthName(item.month, lang),
    revenue: item.revenue,
    expenses: item.expenses,
    profit: item.profit,
  }))

  // Revenue analysis monthly trend data
  // Uses per-month lease-aware expected revenue from the API (item.expected)
  // instead of the static data.expectedRevenue (which was the same for all months).
  const revenueTrendData = data.trend.map(item => ({
    month: getMonthName(item.month, lang),
    revenue: item.revenue,
    expected: (item as any).expected ?? data.expectedRevenue,
  }))

  const netProfitMargin = data.grossRevenue > 0 ? ((data.netIncome / data.grossRevenue) * 100) : 0
  const expenseRatio = data.grossRevenue > 0 ? ((data.totalExpenses / data.grossRevenue) * 100) : 0
  const generatedTimestamp = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6">
      {/* Professional Report Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b-2 border-emerald/20 print:border-emerald/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald flex items-center justify-center text-white font-bold text-sm shrink-0">AM</div>
          <div className="min-w-0">
            <h2 className="font-bold text-foreground text-sm sm:text-base truncate">Al Reef Al Madeena</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">Real Estate Management & General Maintenance</p>
          </div>
        </div>
        <div className="text-center hidden md:block">
          <h1 className="text-lg font-bold">{t('financialSummary', lang)}</h1>
          <p className="text-xs text-muted-foreground">{getMonthName(selectedMonth, lang)} {selectedYear}</p>
        </div>
        <div className="text-right min-w-0">
          <p className="font-medium text-sm">{getMonthName(selectedMonth, lang)} {selectedYear}</p>
          <p className="text-xs text-muted-foreground hidden sm:block">{t('generatedOn', lang)}: {generatedTimestamp}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4 no-print">
        <div className="flex items-center justify-center gap-2 sm:gap-4 mx-auto sm:mx-0">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-bold">
            {getMonthName(selectedMonth, lang)} {selectedYear}
          </h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mx-auto sm:mx-0">
          <Button
            onClick={handleExportXLSX}
            disabled={exporting}
            className="bg-emerald hover:bg-emerald/90 text-white"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            {exporting ? t('loading', lang) : t('exportData', lang)}
          </Button>
          <Button
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className="bg-emerald hover:bg-emerald/90 text-white"
          >
            {exportingPDF ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {exportingPDF ? t('loading', lang) : t('exportPDF', lang)}
          </Button>
          <Button onClick={handlePrint} variant="outline" className="border-emerald text-emerald">
            <Download className="w-4 h-4 mr-2" />
            {t('printReport', lang)}
          </Button>
        </div>
      </div>

      {/* Executive Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Monthly Revenue */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-emerald" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('revenue', lang)}</p>
            <p className="text-xl font-bold text-emerald truncate text-ellipsis overflow-hidden">{formatAED(data.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('ofExpected', lang)} {formatAED(data.expectedRevenue)}</p>
          </CardContent>
        </Card>

        {/* Monthly Expenses */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-terracotta" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-terracotta/10 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-terracotta" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('expenses', lang)}</p>
            <p className="text-xl font-bold text-terracotta truncate text-ellipsis overflow-hidden">{formatAED(data.totalExpenses)}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.grossRevenue > 0 ? `${((data.totalExpenses / data.grossRevenue) * 100).toFixed(0)}% of revenue` : '—'}</p>
          </CardContent>
        </Card>

        {/* Monthly Profit */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className={`h-1 ${data.profitLoss >= 0 ? 'bg-emerald' : 'bg-red-500'}`} />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-full ${data.profitLoss >= 0 ? 'bg-emerald/10' : 'bg-red-100'} flex items-center justify-center`}>
                <DollarSign className={`w-4 h-4 ${data.profitLoss >= 0 ? 'text-emerald' : 'text-red-500'}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('profitOrLoss', lang)}</p>
            <p className={`text-xl font-bold truncate text-ellipsis overflow-hidden ${data.profitLoss >= 0 ? 'text-emerald' : 'text-red-600'}`}>
              {formatAED(data.profitLoss)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{data.profitLoss >= 0 ? 'PROFIT' : 'LOSS'}</p>
          </CardContent>
        </Card>

        {/* Occupancy Revenue */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-deep-teal" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-deep-teal/10 flex items-center justify-center">
                <Home className="w-4 h-4 text-deep-teal" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('occupancyRate', lang)}</p>
            <p className="text-xl font-bold text-deep-teal">{data.occupancyRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{data.occupiedUnits}/{data.totalUnits} {t('occupiedUnits', lang).toLowerCase()}</p>
          </CardContent>
        </Card>

        {/* Outstanding Rent */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-amber-500" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('outstanding', lang)}</p>
            <p className="text-xl font-bold text-amber-600 truncate text-ellipsis overflow-hidden">{formatAED(Math.max(0, data.expectedRevenue - data.totalRevenue))}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.grossRevenue > 0 ? `${(100 - data.collectionRate).toFixed(0)}% uncollected` : '—'}</p>
          </CardContent>
        </Card>

        {/* Collection Percentage */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-gold" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-gold" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('collectionRate', lang)}</p>
            <p className="text-xl font-bold text-gold">{data.collectionRate}%</p>
            <div className="mt-1.5">
              <Progress value={data.collectionRate} className="h-1.5 [&>div]:bg-gold" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue vs Expenses Trend */}
        <Card className="lg:col-span-2" ref={barChartRef}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('sixMonthTrend', lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => formatAED(value)}
                    contentStyle={{ backgroundColor: '#FFF8E7', border: '1px solid #e5e0d5', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name={t('revenue', lang)} fill="#0D7C3D" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name={t('expenses', lang)} fill="#C4653A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown Pie */}
        <Card ref={pieChartRef}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('expenseBreakdown', lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            {expensePieData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {expensePieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAED(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex flex-col items-center justify-center text-muted-foreground">
                <Receipt className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">{t('noExpensesMonth', lang)}</p>
                <p className="text-xs mt-1">Expense breakdown will appear when expenses are recorded</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Analysis Section */}
      <Card ref={areaChartRef}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald" />
            {t('revenueAnalysis', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Revenue Trend Line Chart */}
            <div>
              <h4 className="text-sm font-semibold mb-3">{t('monthlyTrend', lang)}</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatAED(value)}
                      contentStyle={{ backgroundColor: '#FFF8E7', border: '1px solid #e5e0d5', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" name={t('revenue', lang)} stroke="#0D7C3D" fill="#0D7C3D" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-3">{t('totalRevenue', lang)}</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowUpRight className="w-4 h-4 text-emerald shrink-0" />
                    <span className="text-sm min-w-0 truncate">{t('cashCollected', lang)}</span>
                  </div>
                  <span className="font-semibold text-emerald shrink-0">{formatAED(data.cashCollected)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-50 to-amber-100/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowDownRight className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-sm min-w-0 truncate">{t('adjustmentsTotal', lang)}</span>
                  </div>
                  <span className="font-semibold text-amber-600 shrink-0">-{formatAED(data.adjustmentTotal)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50/80 to-emerald-100/30 border border-emerald/20">
                  <span className="text-sm font-semibold min-w-0 truncate">{t('netRevenue', lang)}</span>
                  <span className="font-bold text-emerald shrink-0">{formatAED(data.netRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm min-w-0 truncate">{t('otherIncome', lang)}</span>
                  </div>
                  <span className="font-semibold shrink-0">{formatAED(data.otherIncome)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald/20">
                  <span className="text-sm font-semibold min-w-0 truncate">{t('grossRevenue', lang)}</span>
                  <span className="font-bold text-emerald shrink-0">{formatAED(data.grossRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm min-w-0 truncate">{t('vacancyLoss', lang)}</span>
                  </div>
                  <span className="font-semibold text-red-500 shrink-0">-{formatAED(data.vacancyLoss)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm min-w-0 truncate">{t('badDebt', lang)}</span>
                  </div>
                  <span className="font-semibold text-red-500 shrink-0">-{formatAED(data.badDebt)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profit & Loss Section with Performance Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald" />
            {t('profitAndLoss', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* P&L Statement */}
            <div className="space-y-2">
              {/* Revenue */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                <span className="text-sm font-medium min-w-0 truncate">{t('cashCollected', lang)}</span>
                <span className="font-semibold text-emerald shrink-0">{formatAED(data.cashCollected)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-50 to-amber-100/50">
                <span className="text-sm min-w-0 truncate">{t('adjustmentsTotal', lang)}</span>
                <span className="font-semibold text-amber-600 shrink-0">-{formatAED(data.adjustmentTotal)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm min-w-0 truncate">{t('otherIncome', lang)}</span>
                <span className="font-semibold shrink-0">{formatAED(data.otherIncome)}</span>
              </div>

              {/* Gross Revenue */}
              <div className="flex items-center justify-between p-3 rounded-lg border-t-2 border-b border-emerald/30 bg-gradient-to-r from-emerald-50 to-emerald-100/30">
                <span className="text-sm font-bold min-w-0 truncate">{t('grossRevenue', lang)}</span>
                <span className="font-bold text-emerald shrink-0">{formatAED(data.grossRevenue)}</span>
              </div>

              {/* Deductions */}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mt-2">
                {t('costOfOperations', lang)}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100/50">
                <span className="text-sm min-w-0 truncate">{t('vacancyLoss', lang)}</span>
                <span className="font-semibold text-red-500 shrink-0">-{formatAED(data.vacancyLoss)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100/50">
                <span className="text-sm min-w-0 truncate">{t('badDebt', lang)}</span>
                <span className="font-semibold text-red-500 shrink-0">-{formatAED(data.badDebt)}</span>
              </div>

              {/* Gross Profit */}
              <div className="flex items-center justify-between p-3 rounded-lg border-t-2 border-b border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100/50">
                <span className="text-sm font-bold min-w-0 truncate">{t('grossProfit', lang)}</span>
                <span className={`font-bold shrink-0 ${data.grossProfit >= 0 ? 'text-emerald' : 'text-red-600'}`}>{formatAED(data.grossProfit)}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100/50">
                <span className="text-sm min-w-0 truncate">{t('operatingExpenses', lang)}</span>
                <span className="font-semibold text-red-500 shrink-0">-{formatAED(data.costOfOperations)}</span>
              </div>

              {/* Net Income */}
              <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${data.netIncome >= 0 ? 'border-emerald bg-gradient-to-r from-emerald-50 to-emerald-100/30' : 'border-red-300 bg-gradient-to-r from-red-50 to-red-100/30'}`}>
                <div className="flex items-center gap-2">
                  {data.netIncome >= 0 ? (
                    <ArrowUpRight className="w-5 h-5 text-emerald" />
                  ) : data.netIncome < 0 ? (
                    <ArrowDownRight className="w-5 h-5 text-red-500" />
                  ) : (
                    <Minus className="w-5 h-5 text-muted-foreground" />
                  )}
                  <span className="text-base font-bold">{t('netIncome', lang)}</span>
                </div>
                <span className={`text-2xl font-bold ${data.netIncome >= 0 ? 'text-emerald' : 'text-red-600'}`}>
                  {formatAED(data.netIncome)}
                </span>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Performance Metrics</h4>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('profitOrLoss', lang)} %</span>
                  <span className={`text-sm font-bold ${data.netIncome >= 0 ? 'text-emerald' : 'text-red-600'}`}>{netProfitMargin.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(Math.max(Math.abs(netProfitMargin), 0), 100)} className="h-2.5 [&>div]:bg-emerald" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('collectionRate', lang)}</span>
                  <span className="text-sm font-bold text-deep-teal">{data.collectionRate}%</span>
                </div>
                <Progress value={data.collectionRate} className="h-2.5 [&>div]:bg-deep-teal" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('occupancyRate', lang)}</span>
                  <span className="text-sm font-bold text-gold">{data.occupancyRate}%</span>
                </div>
                <Progress value={data.occupancyRate} className="h-2.5 [&>div]:bg-gold" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('debits', lang)} / {t('revenue', lang)}</span>
                  <span className="text-sm font-bold text-terracotta">{expenseRatio.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(expenseRatio, 100)} className="h-2.5 [&>div]:bg-terracotta" />
              </div>

              {/* Key indicators summary */}
              <div className="mt-4 p-4 rounded-lg bg-muted/30 border">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Key Indicators</h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 rounded bg-background">
                    <p className="text-xs text-muted-foreground">{t('collectionRate', lang)}</p>
                    <p className="text-lg font-bold text-deep-teal">{data.collectionRate}%</p>
                  </div>
                  <div className="text-center p-2 rounded bg-background">
                    <p className="text-xs text-muted-foreground">{t('occupancyRate', lang)}</p>
                    <p className="text-lg font-bold text-gold">{data.occupancyRate}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expense Details Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowDownRight className="w-5 h-5 text-terracotta" />
              {t('expenseDetails', lang)}
            </CardTitle>
            {data.monthlyExpenses.length > 0 && (
              <Badge className="bg-terracotta/10 text-terracotta border-terracotta/20">{formatAED(data.totalExpenses)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {data.monthlyExpenses.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-terracotta/5 hover:bg-terracotta/10">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{t('expenseCategory', lang)}</TableHead>
                    <TableHead>{t('description', lang)}</TableHead>
                    <TableHead className="text-right">{t('amount', lang)}</TableHead>
                    <TableHead>{t('vendor', lang)}</TableHead>
                    <TableHead className="w-20">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthlyExpenses.map((e, idx) => {
                    const catColor = (() => {
                      const colors: Record<string, string> = {
                        manpower: '#0D7C3D', salary: '#0A5C4E', utility: '#C5A028',
                        utilities: '#C5A028', maintenance: '#C4653A', municipality: '#8b5cf6',
                        security: '#06b6d4', insurance: '#f59e0b', leasing: '#ef4444', other: '#6b7280',
                      }
                      return colors[e.category] || '#6b7280'
                    })()
                    return (
                      <TableRow key={e.id} className="border-l-3" style={{ borderLeftColor: catColor }}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                            <Badge variant="secondary" className="text-xs font-normal inline-block max-w-[80px] truncate">{getExpenseCategoryLabel(e.category, lang)}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium max-w-[150px] truncate">{e.description}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold text-terracotta">{formatAED(e.amount)}</p>
                        </TableCell>
                        <TableCell>
                          {e.vendor ? (
                            <p className="text-sm max-w-[100px] truncate">{e.vendor}</p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {e.recurring ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1 inline-block max-w-[80px] truncate">
                              <RefreshCw className="w-3 h-3" />
                              {t('recurring', lang)}
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs inline-block max-w-[80px] truncate">One-time</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Expense Total Row */}
                  <TableRow className="bg-terracotta/10 hover:bg-terracotta/15 font-bold">
                    <TableCell colSpan={3} className="font-bold text-terracotta">{t('totalExpenses', lang)}</TableCell>
                    <TableCell className="text-right font-bold text-terracotta">{formatAED(data.totalExpenses)}</TableCell>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground">{data.monthlyExpenses.length} {t('expensesCount', lang)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">{t('noExpensesMonth', lang)}</p>
              <p className="text-xs mt-1">Expenses will appear here when they are added</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
