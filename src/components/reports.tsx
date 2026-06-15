'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { ReportData, PaymentData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, formatDate, getCategoryIcon, isFinanciallyActive } from '@/lib/utils'
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

      // ── Credit Table: Income by Tenant ──
      // Get monthly payments for the credit table
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

      // Build income items for the month (rent payments)
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

      // Add reservation deposits as income items for the selected month
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

      // ─── Consolidate linked-unit (group) payments ───
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

      // Sort: method priority (Cash → Bank Transfer → Cheque), then tenant name
      consolidatedMonthlyItems.sort((a, b) => {
        const methodDiff = getMethodSortPriority(a.method) - getMethodSortPriority(b.method)
        if (methodDiff !== 0) return methodDiff
        return a.tenantName.localeCompare(b.tenantName)
      })

      pdf.addPage()
      let creditY = 18
      // Mini header
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pageWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.text('Al Reef Al Madeena', margin, 9)
      pdf.setFontSize(8)
      pdf.text(`${t('financialSummary', lang)} — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
      creditY = 22

      // Credit table title
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(12)
      pdf.text(`${t('income', lang)} — ${t('rentCollected', lang)}`, margin, creditY)

      // Income total badge
      pdf.setFillColor('#E8F5E9')
      const mBadgeW = 45
      pdf.roundedRect(pageWidth - margin - mBadgeW, creditY - 5, mBadgeW, 8, 2, 2, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(9)
      pdf.text(formatAED(data.cashCollected), pageWidth - margin - mBadgeW + 3, creditY)
      creditY += 6

      // Credit table header - No Time or Status columns
      pdf.setFillColor(13, 124, 61)
      pdf.rect(margin, creditY, contentWidth, 8, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(7.5)
      pdf.text('#', margin + 3, creditY + 5.5)
      pdf.text(t('tenantName', lang), margin + 8, creditY + 5.5)
      pdf.text(t('property', lang), margin + 58, creditY + 5.5)
      pdf.text(t('unitNumber', lang), margin + 92, creditY + 5.5)
      pdf.text(t('amount', lang), margin + 106, creditY + 5.5)
      pdf.text(t('paymentMethod', lang), margin + 142, creditY + 5.5)
      creditY += 8

      // Credit rows
      for (let i = 0; i < consolidatedMonthlyItems.length; i++) {
        if (creditY > pageHeight - 25) {
          pdf.addPage()
          creditY = 18
          pdf.setFillColor(13, 124, 61)
          pdf.rect(0, 0, pageWidth, 14, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(9)
          pdf.text('Al Reef Al Madeena', margin, 9)
          pdf.setFontSize(8)
          pdf.text(`${t('income', lang)} (cont.) — ${monthName} ${selectedYear}`, pageWidth - margin, 9, { align: 'right' })
          creditY = 22
          // Re-draw header
          pdf.setFillColor(13, 124, 61)
          pdf.rect(margin, creditY, contentWidth, 8, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(7.5)
          pdf.text('#', margin + 3, creditY + 5.5)
          pdf.text(t('tenantName', lang), margin + 8, creditY + 5.5)
          pdf.text(t('property', lang), margin + 58, creditY + 5.5)
          pdf.text(t('unitNumber', lang), margin + 92, creditY + 5.5)
          pdf.text(t('amount', lang), margin + 106, creditY + 5.5)
          pdf.text(t('paymentMethod', lang), margin + 142, creditY + 5.5)
          creditY += 8
        }
        const item = consolidatedMonthlyItems[i]
        const rowBg = item.isConsolidated ? '#EEF2FF' : (i % 2 === 0 ? '#FFFFFF' : '#F9FAFB')
        pdf.setFillColor(rowBg)
        pdf.rect(margin, creditY, contentWidth, 7, 'F')

        // Late indicator
        if (item.isLate) {
          pdf.setFillColor('#FFEBEE')
          pdf.rect(margin, creditY, contentWidth, 7, 'F')
          pdf.setFillColor('#D32F2F')
          pdf.rect(margin, creditY, 1.5, 7, 'F')
        }

        // Indigo left border for consolidated entries
        if (item.isConsolidated) {
          pdf.setFillColor('#6366F1') // indigo
          pdf.rect(margin, creditY, 1.5, 7, 'F')
        }

        pdf.setTextColor(item.isLate ? 180 : 40, item.isLate ? 40 : 40, item.isLate ? 40 : 40)
        pdf.setFontSize(7.5)
        pdf.text(String(i + 1), margin + 3, creditY + 5)
        pdf.text(item.tenantName.substring(0, 35), margin + 8, creditY + 5)
        pdf.text(item.propertyName.substring(0, 24), margin + 58, creditY + 5)
        pdf.text((item.unitNumber || '-').substring(0, 20), margin + 92, creditY + 5)
        pdf.setTextColor(13, 124, 61)
        pdf.text(formatAED(item.amount), margin + 106, creditY + 5)
        pdf.setTextColor(item.isLate ? 180 : 40, item.isLate ? 40 : 40, item.isLate ? 40 : 40)
        pdf.text((item.method || '-').substring(0, 18), margin + 142, creditY + 5)
        // Show linked-unit indicator for consolidated entries
        if (item.isConsolidated) {
          pdf.setFontSize(6)
          pdf.setTextColor(99, 102, 241) // indigo
          pdf.text('Linked Units', margin + 142, creditY + 5 + 3.5)
          pdf.setFontSize(7.5)
        }
        creditY += 7
      }

      // Income total row
      if (creditY > pageHeight - 25) { pdf.addPage(); creditY = 22 }
      pdf.setFillColor('#E8F5E9')
      pdf.rect(margin, creditY, contentWidth, 7, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`TOTAL INCOME: ${formatAED(data.cashCollected)}`, margin + 10, creditY + 5)
      pdf.text(`${consolidatedMonthlyItems.length} entries`, margin + 142, creditY + 5)
      pdf.setFont('helvetica', 'normal')
      creditY += 10

      // ── Payment Method Totals ──
      const monthMethodTotals: Record<string, number> = {}
      for (const p of consolidatedMonthlyItems) {
        // Normalize method names: 'bank_transfer' and 'transfer' → 'transfer'
        let method = (p.method || 'other').toLowerCase()
        if (method === 'bank_transfer') method = 'transfer'
        monthMethodTotals[method] = (monthMethodTotals[method] || 0) + p.amount
      }
      const mTotalCash = monthMethodTotals['cash'] || 0
      const mTotalBankTransfer = monthMethodTotals['transfer'] || 0
      const mTotalCheque = monthMethodTotals['cheque'] || 0

      if (creditY > pageHeight - 35) { pdf.addPage(); creditY = 22 }
      // Payment Method Summary box
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

      // ── Page 2: Charts ──
      // Track Y position manually for reliable placement
      let chartPageY = 20
      let isOnChartPage = false

      // Capture bar chart
      if (barChartRef.current) {
        try {
          const canvas = await html2canvas(barChartRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false })
          const imgData = canvas.toDataURL('image/png')
          pdf.addPage()
          isOnChartPage = true
          pdf.setFillColor(13, 124, 61)
          pdf.rect(0, 0, pageWidth, 15, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(12)
          pdf.text(`${t('sixMonthTrend', lang)} - ${monthName} ${selectedYear}`, pageWidth / 2, 10, { align: 'center' })
          pdf.setTextColor(0, 0, 0)
          const imgW = contentWidth
          const imgH = (canvas.height / canvas.width) * imgW
          const actualImgH = Math.min(imgH, 120)
          pdf.addImage(imgData, 'PNG', margin, 20, imgW, actualImgH)
          chartPageY = 20 + actualImgH + 5
        } catch { /* skip chart if capture fails */ }
      }

      // Capture pie chart - place relative to tracked bar chart Y position
      if (pieChartRef.current) {
        try {
          const canvas = await html2canvas(pieChartRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false })
          const imgData = canvas.toDataURL('image/png')
          const imgW = contentWidth * 0.8
          const imgH = (canvas.height / canvas.width) * imgW
          const actualPieH = Math.min(imgH, 100)
          // Check if pie fits on current chart page
          if (isOnChartPage && chartPageY + actualPieH + 5 < pageHeight - 25) {
            // Place on same page as bar chart
            pdf.addImage(imgData, 'PNG', margin + contentWidth * 0.1, chartPageY, imgW, actualPieH)
            chartPageY += actualPieH + 5
          } else {
            // Add new page for pie chart
            pdf.addPage()
            isOnChartPage = true
            chartPageY = 20
            pdf.addImage(imgData, 'PNG', margin + contentWidth * 0.1, chartPageY, imgW, actualPieH)
            chartPageY += actualPieH + 5
          }
        } catch { /* skip chart if capture fails */ }
      }

      // ── Page 3: Revenue Analysis Chart ──
      let areaChartEndY = 20
      if (areaChartRef.current) {
        try {
          const canvas = await html2canvas(areaChartRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false })
          const imgData = canvas.toDataURL('image/png')
          pdf.addPage()
          pdf.setFillColor(13, 124, 61)
          pdf.rect(0, 0, pageWidth, 15, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(12)
          pdf.text(`${t('revenueAnalysis', lang)} - ${monthName} ${selectedYear}`, pageWidth / 2, 10, { align: 'center' })
          pdf.setTextColor(0, 0, 0)
          const imgW = contentWidth
          const imgH = (canvas.height / canvas.width) * imgW
          const actualAreaH = Math.min(imgH, 140)
          pdf.addImage(imgData, 'PNG', margin, 20, imgW, actualAreaH)
          areaChartEndY = 20 + actualAreaH + 5
        } catch { /* skip chart if capture fails */ }
      }

      // ── P&L Statement ──
      // Track Y position after area chart; add new page if not enough room
      let plY: number
      if (areaChartEndY + 80 < pageHeight - 25) {
        // Place P&L on the same page as area chart
        plY = areaChartEndY
      } else {
        pdf.addPage()
        plY = 20
      }
      pdf.setFontSize(12)
      pdf.setTextColor(13, 124, 61)
      pdf.text(t('profitAndLoss', lang), margin, plY)
      plY += 8
      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)

      const plItems = [
        [t('rentalIncome', lang), formatAED(data.rentalIncome), ''],
        [t('otherIncome', lang), formatAED(data.otherIncome), ''],
        [t('grossRevenue', lang), formatAED(data.grossRevenue), 'bold'],
        [t('adjustmentsTotal', lang), `-${formatAED(data.adjustmentTotal)}`, 'red'],
        [t('netRevenue', lang), formatAED(data.netRevenue), data.netRevenue >= 0 ? 'green' : 'red'],
        [t('vacancyLoss', lang), `-${formatAED(data.vacancyLoss)}`, 'red'],
        [t('badDebt', lang), `-${formatAED(data.badDebt)}`, 'red'],
        [t('grossProfit', lang), formatAED(data.grossProfit), data.grossProfit >= 0 ? 'green' : 'red'],
        [t('operatingExpenses', lang), `-${formatAED(data.costOfOperations)}`, 'red'],
        [t('netIncome', lang), formatAED(data.netIncome), data.netIncome >= 0 ? 'green' : 'red'],
      ]
      plItems.forEach(([label, value, style]) => {
        if (plY > pageHeight - 25) {
          pdf.addPage()
          plY = 20
          // Redraw P&L header on new page
          pdf.setFontSize(12)
          pdf.setTextColor(13, 124, 61)
          pdf.text(t('profitAndLoss', lang) + ' (cont.)', margin, plY)
          plY += 8
          pdf.setFontSize(9)
          pdf.setTextColor(0, 0, 0)
        }
        if (style === 'bold') pdf.setFont('helvetica', 'bold')
        else pdf.setFont('helvetica', 'normal')
        pdf.text(label, margin, plY)
        pdf.text(value, margin + contentWidth, plY, { align: 'right' })
        plY += 6
      })

      // Expense breakdown table
      if (plY > pageHeight - 60) { pdf.addPage(); plY = 20 }
      plY += 5
      pdf.setFontSize(11)
      pdf.setTextColor(13, 124, 61)
      pdf.text(t('expenseBreakdown', lang), margin, plY)
      plY += 7
      // Draw expense breakdown table header (function for reuse on page breaks)
      const drawExpenseTableHeader = (startY: number) => {
        pdf.setFontSize(9)
        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'bold')
        pdf.text(t('expenseCategory', lang), margin, startY)
        pdf.text(t('amount', lang), margin + contentWidth, startY, { align: 'right' })
        pdf.line(margin, startY + 2, margin + contentWidth, startY + 2)
        pdf.setFont('helvetica', 'normal')
        return startY + 6
      }
      plY = drawExpenseTableHeader(plY)
      Object.entries(data.expenseBreakdown).forEach(([key, value]) => {
        if (plY > pageHeight - 25) {
          pdf.addPage()
          plY = 20
          // Redraw expense table header on new page
          pdf.setFontSize(11)
          pdf.setTextColor(13, 124, 61)
          pdf.text(t('expenseBreakdown', lang) + ' (cont.)', margin, plY)
          plY += 7
          plY = drawExpenseTableHeader(plY)
        }
        pdf.text(getExpenseCategoryLabelExport(key), margin, plY)
        pdf.text(formatAED(value), margin + contentWidth, plY, { align: 'right' })
        plY += 5
      })

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

  const handleExportXLSX = useCallback(() => {
    try {
      setExporting(true)
      const store = useDataStore.getState()
      const { tenants, payments, expenses, maintenanceItems, company, reservations } = store
      const properties = [...store.properties].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      const reportData = store.getReportData(selectedMonth, selectedYear)

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

      // ── Sheet 2: Properties ──
      const propertiesHeader = [
        'Property Name', 'Name (Arabic)', 'Type', 'Address', 'Total Units',
        'Floors', 'Active Tenants', 'Occupancy %', 'Monthly Revenue (AED)', 'Status',
      ]
      const propertiesRows = properties.map(p => {
        const activeTenants = tenants.filter(t => t.propertyId === p.id && isFinanciallyActive(t.status))
        const occupancy = p.totalUnits > 0 ? Math.round((activeTenants.length / p.totalUnits) * 100) : 0
        const monthlyRevenue = activeTenants.reduce((sum, t) => sum + t.rentAmount, 0)
        return [
          p.name,
          p.nameAr || '',
          getPropertyTypeLabel(p.type),
          p.address || '',
          p.totalUnits,
          p.floors,
          activeTenants.length,
          `${occupancy}%`,
          monthlyRevenue,
          p.archived ? 'Archived' : 'Active',
        ]
      })
      const wsProperties = XLSX.utils.aoa_to_sheet([propertiesHeader, ...propertiesRows])
      wsProperties['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsProperties, 'Properties')

      // ── Sheet 3: Tenants ──
      const tenantsHeader = [
        'Tenant Name', 'Name (Arabic)', 'Property', 'Unit Number', 'Unit Type',
        'Floor', 'Size (sqft)', 'Nationality', 'Phone', 'WhatsApp',
        'Emirates ID', 'Employer', 'Monthly Rent (AED)', 'Municipality Fee (AED)',
        'Security Deposit (AED)', 'Payment Method', 'Lease Start', 'Lease End',
        'Contract Duration (months)', 'Status', 'Tenant Score', 'System Score', 'Score Override', 'Override Reason', 'Late Payments',
      ]
      const tenantsRows = tenants.map(tn => {
        const prop = properties.find(p => p.id === tn.propertyId)
        return [
          tn.name,
          tn.nameAr || '',
          prop?.name || '',
          tn.unitNumber || '',
          getUnitTypeLabel(tn.unitType),
          tn.floor || '',
          tn.sizeSqft || '',
          tn.nationality || '',
          tn.phone,
          tn.whatsapp || '',
          tn.emiratesId || '',
          tn.employer || '',
          tn.rentAmount,
          tn.municipalityFee || '',
          tn.securityDeposit || '',
          tn.paymentMethod || '',
          tn.leaseStart ? formatDate(tn.leaseStart) : '',
          tn.leaseEnd ? formatDate(tn.leaseEnd) : '',
          tn.contractDuration || '',
          tn.status,
          tn.tenantScore,
          tn.systemScore ?? tn.tenantScore,
          tn.manualScoreOverride ?? '',
          tn.manualScoreReason ?? '',
          tn.latePaymentCount,
        ]
      })
      const wsTenants = XLSX.utils.aoa_to_sheet([tenantsHeader, ...tenantsRows])
      wsTenants['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }]
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
        'Date', 'Tenant Name', 'Property', 'Unit(s)', 'Month', 'Year',
        'Amount (AED)', 'Method', 'Reference', 'Late?', 'Days Late', 'Type',
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
          const tenantGroup = (store as any).tenantGroups?.find((g: any) => g.id === firstTenant.groupId)
          const totalAmount = groupPayments.reduce((sum, p) => sum + p.amount, 0)
          const unitNumbers = groupPayments.map(p => {
            const t = tenants.find(tn => tn.id === p.tenantId)
            return t?.unitNumber || ''
          }).filter(Boolean).join(', ')
          const maxDaysLate = Math.max(...groupPayments.map(p => p.daysLate || 0))

          xlsxPaymentEntries.push([
            formatDate(firstPayment.date),
            tenantGroup ? tenantGroup.name : firstTenant.name,
            prop?.name || '',
            unitNumbers,
            getMonthName(firstPayment.month, 'en'),
            firstPayment.year,
            totalAmount,
            firstPayment.method || '',
            firstPayment.reference || '',
            groupPayments.some(p => p.isLate) ? 'Yes' : 'No',
            maxDaysLate,
            'Consolidated (Linked Units)',
          ])
          groupPayments.forEach(p => groupedPaymentIds.add(p.id))
        } else {
          // Single entry from a group tenant — just add individually
          groupedPaymentIds.add(groupPayments[0].id)
          const p = groupPayments[0]
          const tenant = tenants.find(tn => tn.id === p.tenantId)
          const prop = tenant ? properties.find(pr => pr.id === tenant.propertyId) : null
          xlsxPaymentEntries.push([
            formatDate(p.date),
            tenant?.name || '',
            prop?.name || '',
            tenant?.unitNumber || '',
            getMonthName(p.month, 'en'),
            p.year,
            p.amount,
            p.method || '',
            p.reference || '',
            p.isLate ? 'Yes' : 'No',
            p.daysLate,
            'Single Unit',
          ])
        }
      }

      // Add non-grouped payments
      for (const p of payments) {
        if (groupedPaymentIds.has(p.id)) continue
        const tenant = tenants.find(tn => tn.id === p.tenantId)
        const prop = tenant ? properties.find(pr => pr.id === tenant.propertyId) : null
        xlsxPaymentEntries.push([
          formatDate(p.date),
          tenant?.name || '',
          prop?.name || '',
          tenant?.unitNumber || '',
          getMonthName(p.month, 'en'),
          p.year,
          p.amount,
          p.method || '',
          p.reference || '',
          p.isLate ? 'Yes' : 'No',
          p.daysLate,
          'Single Unit',
        ])
      }

      // Sort by method priority, then by date
      xlsxPaymentEntries.sort((a, b) => {
        const methodDiff = getMethodSortXlsx(a[7] as string) - getMethodSortXlsx(b[7] as string)
        if (methodDiff !== 0) return methodDiff
        return new Date(b[0] as string).getTime() - new Date(a[0] as string).getTime()
      })

      const wsPayments = XLSX.utils.aoa_to_sheet([paymentsHeader, ...xlsxPaymentEntries])
      wsPayments['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 22 }]
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments')

      // ── Sheet 5: Expenses ──
      const expensesHeader = [
        'Date', 'Category', 'Description', 'Amount (AED)', 'Vendor',
        'Invoice Number', 'Building', 'Recurring',
      ]
      const expensesRows = expenses
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(e => [
          formatDate(e.date),
          getExpenseCategoryLabelExport(e.category),
          e.description,
          e.amount,
          e.vendor || '',
          e.invoiceNumber || '',
          e.building || '',
          e.recurring ? 'Yes' : 'No',
        ])
      const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesRows])
      wsExpenses['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses')

      // ── Sheet 6: Maintenance ──
      const maintenanceHeader = [
        'Title', 'Category', 'Priority', 'Status', 'Property',
        'Vendor', 'Estimated Cost (AED)', 'Actual Cost (AED)',
        'Description', 'Date Created', 'Date Completed',
      ]
      const maintenanceRows = maintenanceItems.map(m => {
        const prop = properties.find(p => p.id === m.propertyId)
        return [
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
      wsMaintenance['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsMaintenance, 'Maintenance')

      // ── Sheet 7: Reservations ──
      const reservationHeader = [
        'Prospect Name', 'Property', 'Unit', 'Deposit Amount (AED)', 'Payment Method',
        'Payment Date', 'Status', 'Deposit Status', 'Emirates ID', 'Notes',
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
            r.prospectName || '',
            prop?.name || '',
            r.unitNumber || '',
            r.depositAmount || 0,
            r.depositPaymentMethod || '',
            paymentDate,
            r.status || '',
            r.depositStatus || '',
            r.emiratesId || '',
            r.notes || '',
          ]
        })
      const wsReservations = XLSX.utils.aoa_to_sheet([reservationHeader, ...reservationRows])
      wsReservations['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, wsReservations, 'Reservations')

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
  const revenueTrendData = data.trend.map(item => ({
    month: getMonthName(item.month, lang),
    revenue: item.revenue,
    expected: data.expectedRevenue,
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
