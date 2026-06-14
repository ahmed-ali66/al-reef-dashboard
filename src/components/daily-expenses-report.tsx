'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { useDataStore } from '@/lib/data-store'
import { formatAED, formatDate, getCategoryIcon } from '@/lib/utils'
import { t, getExpenseCategoryLabel, getNameByLang, type Language } from '@/lib/i18n'
import type { ExpenseData, PaymentData, TenantData, PropertyData, ReservationData } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Loader2,
  ShieldAlert,
  FileSpreadsheet,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
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
} from 'recharts'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { toast } from 'sonner'

const PIE_COLORS = ['#0D7C3D', '#C4653A', '#C5A028', '#0A5C4E', '#8b5cf6', '#ef4444', '#06b6d4', '#f59e0b']

// Category color mapping for consistent visual identity
const CATEGORY_COLORS: Record<string, { bg: string; text: string; fill: string }> = {
  manpower:   { bg: '#0D7C3D', text: '#FFFFFF', fill: '#0D7C3D' },
  salary:     { bg: '#0A5C4E', text: '#FFFFFF', fill: '#0A5C4E' },
  utility:    { bg: '#C5A028', text: '#FFFFFF', fill: '#C5A028' },
  utilities:  { bg: '#C5A028', text: '#FFFFFF', fill: '#C5A028' },
  maintenance:{ bg: '#C4653A', text: '#FFFFFF', fill: '#C4653A' },
  municipality:{ bg: '#8b5cf6', text: '#FFFFFF', fill: '#8b5cf6' },
  security:   { bg: '#06b6d4', text: '#FFFFFF', fill: '#06b6d4' },
  insurance:  { bg: '#f59e0b', text: '#FFFFFF', fill: '#f59e0b' },
  leasing:    { bg: '#ef4444', text: '#FFFFFF', fill: '#ef4444' },
  other:      { bg: '#6b7280', text: '#FFFFFF', fill: '#6b7280' },
}

interface DailyIncomeItem {
  tenantName: string
  propertyName: string
  unitNumber: string | null
  amount: number
  time: string
  method: string | null
  isLate: boolean
  notes: string | null
  source: 'rent' | 'reservation'
}

interface DailyExpenseItem {
  id: string
  category: string
  description: string
  amount: number
  vendor: string | null
  time: string
  building: string | null
  recurring: boolean
}

export default function DailyExpensesReport() {
  const { language, authUser } = useAppStore()
  const lang = language as Language
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [incomeItems, setIncomeItems] = useState<DailyIncomeItem[]>([])
  const [expenseItems, setExpenseItems] = useState<DailyExpenseItem[]>([])
  const [totalIncome, setTotalIncome] = useState(0)
  const [totalExpense, setTotalExpense] = useState(0)

  const barChartRef = useRef<HTMLDivElement>(null)
  const pieChartRef = useRef<HTMLDivElement>(null)

  const canAccess = authUser && isOwnerOrAdmin(authUser.role)

  const computeDailyData = useCallback(() => {
    const { payments, tenants, properties, expenses, reservations } = useDataStore.getState()

    // Filter payments for the selected date
    const dayPayments = payments.filter(p => {
      const paymentDate = new Date(p.date).toISOString().split('T')[0]
      return paymentDate === selectedDate
    })

    // Build income items from rent payments
    const income: DailyIncomeItem[] = dayPayments.map(p => {
      const tenant = tenants.find(t => t.id === p.tenantId)
      const property = tenant ? properties.find(pr => pr.id === tenant.propertyId) : null
      return {
        tenantName: tenant ? getNameByLang(tenant, lang) : 'Unknown',
        propertyName: property?.name || '',
        unitNumber: tenant?.unitNumber || null,
        amount: p.amount,
        time: new Date(p.date).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
        method: p.method,
        isLate: p.isLate || false,
        notes: p.notes || null,
        source: 'rent' as const,
      }
    })

    // Add reservation deposits as income items
    const activeReservations = (reservations || []).filter((r: ReservationData) =>
      r.status !== 'cancelled' && !r.deletedAt
    )
    for (const r of activeReservations) {
      // Include deposits that are paid or partial
      if (r.depositStatus === 'paid' || r.depositStatus === 'partial') {
        // Use depositPaymentDate if available, otherwise fall back to reservationDate
        const paymentDateStr = (r as any).depositPaymentDate
          ? new Date((r as any).depositPaymentDate).toISOString().split('T')[0]
          : new Date(r.reservationDate).toISOString().split('T')[0]
        if (paymentDateStr === selectedDate) {
          const property = properties.find(p => p.id === r.propertyId)
          income.push({
            tenantName: r.prospectName || 'Reservation',
            propertyName: property ? getNameByLang(property, lang) : '',
            unitNumber: r.unitNumber || null,
            amount: r.depositAmount,
            time: (r as any).depositPaymentDate
              ? new Date((r as any).depositPaymentDate).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
              : new Date(r.reservationDate).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
            method: 'reservation_deposit',
            isLate: false,
            notes: r.notes || null,
            source: 'reservation' as const,
          })
        }
      }
    }

    // Handle refunded/cancelled reservations - show as negative income on the date they were updated
    const cancelledReservations = (reservations || []).filter((r: ReservationData) =>
      r.status === 'cancelled' && !r.deletedAt && r.depositStatus === 'refunded'
    )
    for (const r of cancelledReservations) {
      const refundDate = new Date(r.createdAt).toISOString().split('T')[0]  // Use updatedAt if available
      const updatedDate = (r as any).updatedAt ? new Date((r as any).updatedAt).toISOString().split('T')[0] : refundDate
      if (updatedDate === selectedDate) {
        const property = properties.find(p => p.id === r.propertyId)
        income.push({
          tenantName: r.prospectName || 'Refund',
          propertyName: property ? getNameByLang(property, lang) : '',
          unitNumber: r.unitNumber || null,
          amount: -r.depositAmount, // negative amount for refund
          time: updatedDate,
          method: 'reservation_refund',
          isLate: false,
          notes: `Refund: ${r.notes || ''}`,
          source: 'reservation' as const,
        })
      }
    }

    // Filter expenses for the selected date
    const dayExpenses = expenses.filter(e => {
      const expenseDate = new Date(e.date).toISOString().split('T')[0]
      return expenseDate === selectedDate
    })

    // Build expense items
    const expenseList: DailyExpenseItem[] = dayExpenses.map(e => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      vendor: e.vendor,
      time: new Date(e.date).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }),
      building: e.building || null,
      recurring: e.recurring || false,
    }))

    const totalIn = income.reduce((sum, i) => sum + i.amount, 0)
    const totalExp = expenseList.reduce((sum, e) => sum + e.amount, 0)

    setIncomeItems(income)
    setExpenseItems(expenseList)
    setTotalIncome(totalIn)
    setTotalExpense(totalExp)
  }, [selectedDate, lang])

  useEffect(() => { computeDailyData() }, [computeDailyData])

  const netProfitLoss = totalIncome - totalExpense
  const expenseCategoryBreakdown: Record<string, number> = {}
  for (const e of expenseItems) {
    expenseCategoryBreakdown[e.category] = (expenseCategoryBreakdown[e.category] || 0) + e.amount
  }

  // Chart data
  const barChartData = [
    { name: t('income', lang), value: totalIncome, fill: '#0D7C3D' },
    { name: t('debits', lang), value: totalExpense, fill: '#C4653A' },
    { name: t('netProfitLoss', lang), value: Math.max(0, netProfitLoss), fill: '#0A5C4E' },
  ]

  const pieData = Object.entries(expenseCategoryBreakdown).map(([key, value]) => ({
    name: getExpenseCategoryLabel(key, lang),
    value,
  }))

  const prevDay = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const nextDay = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d <= tomorrow) {
      setSelectedDate(d.toISOString().split('T')[0])
    }
  }

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0])
  }

  // ═══════════════════════════════════════════════════════════════════
  // PDF EXPORT — Professional, multi-page with charts and visual design
  // ═══════════════════════════════════════════════════════════════════
  const handleExportPDF = useCallback(async () => {
    try {
      setExportingPDF(true)
      const { company } = useDataStore.getState()
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = pdf.internal.pageSize.getWidth()   // 210
      const ph = pdf.internal.pageSize.getHeight()   // 297
      const m = 14                                     // margin
      const cw = pw - m * 2                            // content width
      const profitMargin = totalIncome > 0 ? ((netProfitLoss / totalIncome) * 100).toFixed(1) : '0'
      const isProfit = netProfitLoss >= 0

      // ─── Helper: draw a rounded rect ───
      const drawRRect = (x: number, y: number, w: number, h: number, r: number, fillColor: string) => {
        pdf.setFillColor(fillColor)
        pdf.roundedRect(x, y, w, h, r, r, 'F')
      }

      // ─── Helper: draw horizontal line ───
      const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, thickness: number = 0.3) => {
        pdf.setDrawColor(color)
        pdf.setLineWidth(thickness)
        pdf.line(x1, y1, x2, y2)
      }

      // ─── Helper: check page break ───
      const checkPage = (y: number, needed: number): number => {
        if (y + needed > ph - 25) {
          pdf.addPage()
          // Redraw mini header on new page
          pdf.setFillColor(13, 124, 61)
          pdf.rect(0, 0, pw, 14, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(9)
          pdf.text('Al Reef Al Madeena', m, 9)
          pdf.setFontSize(8)
          pdf.text(`${t('dailyExpensesReport', lang)} — ${formatDate(selectedDate + 'T00:00:00.000Z')}`, pw - m, 9, { align: 'right' })
          return 22
        }
        return y
      }

      // ═════════════════════════════════════════════════════
      // PAGE 1: COVER + SUMMARY
      // ═════════════════════════════════════════════════════

      // Full-width header band
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pw, 52, 'F')

      // Accent stripe
      pdf.setFillColor(10, 92, 78)
      pdf.rect(0, 48, pw, 4, 'F')

      // Company name
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(22)
      pdf.text('Al Reef Al Madeena', m, 18)
      pdf.setFontSize(10)
      pdf.text('Real Estate Management and General Maintenance - L.L.C - S.P.C', m, 26)
      pdf.setFontSize(9)
      pdf.text("Near LuLu Muraba'a, Al Ain City, Abu Dhabi, UAE", m, 33)

      // Report title — right aligned
      pdf.setFontSize(18)
      pdf.text(t('dailyExpensesReport', lang), pw - m, 22, { align: 'right' })
      pdf.setFontSize(11)
      pdf.text(formatDate(selectedDate + 'T00:00:00.000Z'), pw - m, 32, { align: 'right' })
      pdf.setFontSize(8)
      pdf.text(`${t('generatedOn', lang)}: ${new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pw - m, 40, { align: 'right' })

      let y = 62

      // ─── KPI Cards Row ───
      const cardW = (cw - 9) / 4
      const cardH = 32

      // Helper: draw amount with auto font size to fit card width
      const drawCardAmount = (text: string, x: number, yPos: number, maxW: number) => {
        let fontSize = 12
        pdf.setFontSize(fontSize)
        while (fontSize > 7 && pdf.getStringUnitWidth(text) * fontSize / 2.8 > maxW) {
          fontSize -= 0.5
          pdf.setFontSize(fontSize)
        }
        pdf.text(text, x, yPos)
      }

      // Card 1: Total Income
      drawRRect(m, y, cardW, cardH, 3, '#E8F5E9')
      pdf.setFillColor('#0D7C3D')
      pdf.rect(m, y, cardW, 3, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.text(t('totalIncome', lang), m + 4, y + 11)
      pdf.setTextColor(13, 124, 61)
      drawCardAmount(formatAED(totalIncome), m + 4, y + 22, cardW - 6)
      pdf.setFontSize(7)
      pdf.setTextColor(100, 100, 100)
      pdf.text(`${incomeItems.length} ${t('tenantPayment', lang)}(s)`, m + 4, y + 28)

      // Card 2: Total Expense
      const cx2 = m + cardW + 3
      drawRRect(cx2, y, cardW, cardH, 3, '#FBE9E7')
      pdf.setFillColor('#C4653A')
      pdf.rect(cx2, y, cardW, 3, 'F')
      pdf.setTextColor(196, 101, 58)
      pdf.setFontSize(8)
      pdf.text(t('totalExpense', lang), cx2 + 4, y + 11)
      pdf.setTextColor(196, 101, 58)
      drawCardAmount(formatAED(totalExpense), cx2 + 4, y + 22, cardW - 6)
      pdf.setFontSize(7)
      pdf.setTextColor(100, 100, 100)
      pdf.text(`${expenseItems.length} ${t('expensesCount', lang)}`, cx2 + 4, y + 28)

      // Card 3: Net P/L
      const cx3 = cx2 + cardW + 3
      drawRRect(cx3, y, cardW, cardH, 3, isProfit ? '#E8F5E9' : '#FFEBEE')
      pdf.setFillColor(isProfit ? '#0D7C3D' : '#D32F2F')
      pdf.rect(cx3, y, cardW, 3, 'F')
      pdf.setTextColor(isProfit ? 13 : 211, isProfit ? 124 : 47, isProfit ? 61 : 47)
      pdf.setFontSize(8)
      pdf.text(t('netProfitLoss', lang), cx3 + 4, y + 11)
      drawCardAmount(formatAED(netProfitLoss), cx3 + 4, y + 22, cardW - 6)
      pdf.setFontSize(7)
      pdf.setTextColor(100, 100, 100)
      pdf.text(isProfit ? 'PROFIT' : 'LOSS', cx3 + 4, y + 28)

      // Card 4: Margin %
      const cx4 = cx3 + cardW + 3
      drawRRect(cx4, y, cardW, cardH, 3, '#E0F2F1')
      pdf.setFillColor('#0A5C4E')
      pdf.rect(cx4, y, cardW, 3, 'F')
      pdf.setTextColor(10, 92, 78)
      pdf.setFontSize(8)
      pdf.text(t('profitOrLoss', lang) + ' %', cx4 + 4, y + 11)
      pdf.setFontSize(15)
      pdf.setTextColor(isProfit ? 13 : 211, isProfit ? 124 : 47, isProfit ? 61 : 47)
      pdf.text(`${profitMargin}%`, cx4 + 4, y + 22)

      y += cardH + 10

      // ─── BAR CHART (captured from DOM) ───
      pdf.setTextColor(40, 40, 40)
      pdf.setFontSize(12)
      pdf.text(t('incomeVsExpenses', lang), m, y)
      y += 4

      if (barChartRef.current) {
        try {
          const canvas = await html2canvas(barChartRef.current, {
            scale: 2,
            backgroundColor: '#FFFFFF',
            logging: false,
            useCORS: true,
          })
          const imgData = canvas.toDataURL('image/png')
          const imgW = cw
          const imgH = 65
          pdf.addImage(imgData, 'PNG', m, y, imgW, imgH)
          y += imgH + 8
        } catch {
          // Fallback: simple text-based chart representation
          drawRRect(m, y, cw, 60, 3, '#F9FAFB')
          pdf.setTextColor(120, 120, 120)
          pdf.setFontSize(9)
          pdf.text('Bar Chart: Income vs Expenses', m + 4, y + 10)
          pdf.setFontSize(8)
          pdf.text(`${t('income', lang)}: ${formatAED(totalIncome)}`, m + 4, y + 20)
          pdf.text(`${t('debits', lang)}: ${formatAED(totalExpense)}`, m + 4, y + 28)
          pdf.text(`${t('netProfitLoss', lang)}: ${formatAED(netProfitLoss)}`, m + 4, y + 36)
          y += 68
        }
      } else {
        y += 68
      }

      // ─── PIE CHART (captured from DOM) ───
      y = checkPage(y, 80)
      pdf.setTextColor(40, 40, 40)
      pdf.setFontSize(12)
      pdf.text(t('expenseDistribution', lang), m, y)
      y += 4

      if (pieChartRef.current && pieData.length > 0) {
        try {
          const canvas = await html2canvas(pieChartRef.current, {
            scale: 2,
            backgroundColor: '#FFFFFF',
            logging: false,
            useCORS: true,
          })
          const imgData = canvas.toDataURL('image/png')
          const imgW = cw
          const imgH = 65
          pdf.addImage(imgData, 'PNG', m, y, imgW, imgH)
          y += imgH + 6
        } catch {
          y += 6
        }
      }

      // ─── Category Breakdown Table ───
      y = checkPage(y, 40 + Object.keys(expenseCategoryBreakdown).length * 7)
      pdf.setTextColor(40, 40, 40)
      pdf.setFontSize(11)
      pdf.text('Expense Category Breakdown', m, y)
      y += 5

      // Table header - use relative positions based on content width
      const catAmtX = m + cw * 0.5
      const catPctX = m + cw * 0.72
      const catCountX = m + cw * 0.9
      pdf.setFillColor(10, 92, 78)
      pdf.rect(m, y, cw, 7, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text('Category', m + 10, y + 5)
      pdf.text('Amount (AED)', catAmtX, y + 5)
      pdf.text('% of Total', catPctX, y + 5)
      pdf.text('# Items', catCountX, y + 5)
      y += 7

      // Sort categories by amount desc
      const sortedCats = Object.entries(expenseCategoryBreakdown).sort((a, b) => b[1] - a[1])
      for (let i = 0; i < sortedCats.length; i++) {
        const [cat, amt] = sortedCats[i]
        const pct = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : '0'
        const count = expenseItems.filter(e => e.category === cat).length
        const bgColor = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB'

        y = checkPage(y, 7)
        pdf.setFillColor(bgColor)
        pdf.rect(m, y, cw, 7, 'F')

        // Category color dot
        const catColor = CATEGORY_COLORS[cat]?.fill || '#6b7280'
        pdf.setFillColor(catColor)
        pdf.circle(m + 4, y + 3.5, 2, 'F')

        pdf.setTextColor(40, 40, 40)
        pdf.setFontSize(8)
        pdf.text(getExpenseCategoryLabel(cat, lang), m + 10, y + 5)
        pdf.text(formatAED(amt), catAmtX, y + 5)
        pdf.text(`${pct}%`, catPctX, y + 5)
        pdf.text(String(count), catCountX, y + 5)
        y += 7
      }

      // Category total row
      pdf.setFillColor('#F3F4F6')
      pdf.rect(m, y, cw, 7, 'F')
      pdf.setTextColor(40, 40, 40)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TOTAL', m + 10, y + 5)
      pdf.text(formatAED(totalExpense), catAmtX, y + 5)
      pdf.text('100%', catPctX, y + 5)
      pdf.text(String(expenseItems.length), catCountX, y + 5)
      pdf.setFont('helvetica', 'normal')
      y += 12

      // ═════════════════════════════════════════════════════
      // PAGE 2+: DETAILED TRANSACTIONS
      // ═════════════════════════════════════════════════════
      pdf.addPage()
      y = 18

      // Mini header on detail pages
      pdf.setFillColor(13, 124, 61)
      pdf.rect(0, 0, pw, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.text('Al Reef Al Madeena', m, 9)
      pdf.setFontSize(8)
      pdf.text(`${t('dailyExpensesReport', lang)} — ${formatDate(selectedDate + 'T00:00:00.000Z')}`, pw - m, 9, { align: 'right' })
      y = 22

      // ─── INCOME TABLE ───
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(13)
      pdf.text(`${t('income', lang)} — ${t('rentCollected', lang)}`, m, y)

      // Income total badge
      pdf.setFillColor('#E8F5E9')
      const incomeBadgeW = 45
      drawRRect(pw - m - incomeBadgeW, y - 5, incomeBadgeW, 8, 2, '#E8F5E9')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(9)
      pdf.text(formatAED(totalIncome), pw - m - incomeBadgeW + 3, y)
      y += 6

      // Income table header - Time and Status columns removed, Tenant Name widened
      pdf.setFillColor(13, 124, 61)
      pdf.rect(m, y, cw, 8, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(7.5)
      pdf.text('#', m + 3, y + 5.5)
      pdf.text(t('tenantName', lang), m + 8, y + 5.5)
      pdf.text(t('property', lang), m + 58, y + 5.5)
      pdf.text(t('unitNumber', lang), m + 92, y + 5.5)
      pdf.text(t('amount', lang), m + 106, y + 5.5)
      pdf.text(t('paymentMethod', lang), m + 142, y + 5.5)
      y += 8

      // Income rows - Time and Status columns removed
      const sortedIncome = [...incomeItems].sort((a, b) => a.time.localeCompare(b.time))
      for (let i = 0; i < sortedIncome.length; i++) {
        y = checkPage(y, 7)
        const item = sortedIncome[i]
        const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
        pdf.setFillColor(rowBg)
        pdf.rect(m, y, cw, 7, 'F')

        // Status indicator
        if (item.isLate) {
          pdf.setFillColor('#FFEBEE')
          pdf.rect(m, y, cw, 7, 'F')
          // Red left border for late
          pdf.setFillColor('#D32F2F')
          pdf.rect(m, y, 1.5, 7, 'F')
        }

        pdf.setTextColor(item.isLate ? 180 : 40, item.isLate ? 40 : 40, item.isLate ? 40 : 40)
        pdf.setFontSize(7.5)
        pdf.text(String(i + 1), m + 3, y + 5)
        pdf.text(item.tenantName.substring(0, 35), m + 8, y + 5)
        pdf.text(item.propertyName.substring(0, 24), m + 58, y + 5)
        pdf.text(item.unitNumber || '-', m + 92, y + 5)
        pdf.setTextColor(13, 124, 61)
        pdf.text(formatAED(item.amount), m + 106, y + 5)
        pdf.setTextColor(item.isLate ? 180 : 40, item.isLate ? 40 : 40, item.isLate ? 40 : 40)
        pdf.text((item.method || '-').substring(0, 18), m + 142, y + 5)
        y += 7
      }

      // Income total row
      y = checkPage(y, 8)
      pdf.setFillColor('#E8F5E9')
      pdf.rect(m, y, cw, 7, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`TOTAL INCOME: ${formatAED(totalIncome)}`, m + 10, y + 5)
      pdf.text(`${incomeItems.length} payments`, m + 142, y + 5)
      pdf.setFont('helvetica', 'normal')
      y += 10

      // ─── PAYMENT METHOD TOTALS ───
      const methodTotals: Record<string, number> = {}
      for (const p of incomeItems) {
        const method = (p.method || 'other').toLowerCase()
        methodTotals[method] = (methodTotals[method] || 0) + p.amount
      }
      const totalCash = methodTotals['cash'] || 0
      const totalBankTransfer = methodTotals['transfer'] || 0
      const totalCheque = methodTotals['cheque'] || 0

      y = checkPage(y, 30)
      // Payment Method Summary box
      drawRRect(m, y, cw, 26, 3, '#F0FDF4')
      pdf.setFillColor('#0D7C3D')
      pdf.rect(m, y, cw, 3, 'F')
      pdf.setTextColor(13, 124, 61)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text(t('paymentMethodSummary', lang), m + 4, y + 8)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(40, 40, 40)
      // Cash
      pdf.text(`${t('totalCashPayments', lang)}:`, m + 8, y + 14)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(totalCash), m + 55, y + 14)
      // Bank Transfer
      pdf.setTextColor(40, 40, 40)
      pdf.text(`${t('totalBankTransferPayments', lang)}:`, m + 8, y + 19)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(totalBankTransfer), m + 55, y + 19)
      // Cheque
      pdf.setTextColor(40, 40, 40)
      pdf.text(`${t('totalChequePayments', lang)}:`, m + 8, y + 24)
      pdf.setTextColor(13, 124, 61)
      pdf.text(formatAED(totalCheque), m + 55, y + 24)
      y += 30

      // ─── EXPENSE TABLE ───
      y = checkPage(y, 30)
      pdf.setTextColor(196, 101, 58)
      pdf.setFontSize(13)
      pdf.text(t('debits', lang), m, y)

      // Expense total badge
      drawRRect(pw - m - 45, y - 5, 45, 8, 2, '#FBE9E7')
      pdf.setTextColor(196, 101, 58)
      pdf.setFontSize(9)
      pdf.text(formatAED(totalExpense), pw - m - 42, y)
      y += 6

      // Expense table header - Time column removed, Property column added
      pdf.setFillColor(196, 101, 58)
      pdf.rect(m, y, cw, 8, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(7.5)
      pdf.text('#', m + 3, y + 5.5)
      pdf.text(t('expenseCategory', lang), m + 8, y + 5.5)
      pdf.text(t('description', lang), m + 35, y + 5.5)
      pdf.text(t('amount', lang), m + 77, y + 5.5)
      pdf.text(t('vendor', lang), m + 109, y + 5.5)
      pdf.text(t('property', lang), m + 136, y + 5.5)
      pdf.text('Type', m + 168, y + 5.5)
      y += 8

      // Expense rows - Time removed, Property added
      const sortedExpenses = [...expenseItems].sort((a, b) => a.time.localeCompare(b.time))
      for (let i = 0; i < sortedExpenses.length; i++) {
        y = checkPage(y, 7)
        const item = sortedExpenses[i]
        const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB'
        pdf.setFillColor(rowBg)
        pdf.rect(m, y, cw, 7, 'F')

        // Category color indicator (left border)
        const catColor = CATEGORY_COLORS[item.category]?.fill || '#6b7280'
        pdf.setFillColor(catColor)
        pdf.rect(m, y, 1.5, 7, 'F')

        pdf.setTextColor(40, 40, 40)
        pdf.setFontSize(7.5)
        pdf.text(String(i + 1), m + 3, y + 5)
        pdf.text(getExpenseCategoryLabel(item.category, lang), m + 8, y + 5)
        pdf.text(item.description.substring(0, 28), m + 35, y + 5)
        pdf.setTextColor(196, 101, 58)
        pdf.text(formatAED(item.amount), m + 77, y + 5)
        pdf.setTextColor(40, 40, 40)
        pdf.text((item.vendor || '-').substring(0, 15), m + 109, y + 5)
        pdf.text((item.building || '-').substring(0, 20), m + 136, y + 5)
        pdf.text(item.recurring ? 'Recurring' : 'One-time', m + 168, y + 5)
        y += 7
      }

      // Expense total row
      y = checkPage(y, 8)
      pdf.setFillColor('#FBE9E7')
      pdf.rect(m, y, cw, 7, 'F')
      pdf.setTextColor(196, 101, 58)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`TOTAL EXPENSES: ${formatAED(totalExpense)}`, m + 10, y + 5)
      pdf.text(`${expenseItems.length} items`, m + 136, y + 5)
      pdf.setFont('helvetica', 'normal')
      y += 14

      // ─── NET SUMMARY BOX ───
      y = checkPage(y, 28)
      const summaryBg = isProfit ? '#E8F5E9' : '#FFEBEE'
      const summaryBorder = isProfit ? '#0D7C3D' : '#D32F2F'
      drawRRect(m, y, cw, 24, 4, summaryBg)
      pdf.setFillColor(summaryBorder)
      pdf.rect(m, y, cw, 3, 'F')

      pdf.setTextColor(isProfit ? 13 : 211, isProfit ? 124 : 47, isProfit ? 61 : 47)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text(isProfit ? 'NET PROFIT' : 'NET LOSS', m + 6, y + 12)
      pdf.setFontSize(18)
      pdf.text(formatAED(Math.abs(netProfitLoss)), m + 6, y + 21)

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Margin: ${profitMargin}%`, m + 90, y + 12)
      pdf.text(`Income: ${formatAED(totalIncome)}`, m + 90, y + 19)
      pdf.text(`Expenses: ${formatAED(totalExpense)}`, m + 90, y + 25)

      // ─── Page footers on all pages ───
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        drawLine(m, ph - 12, pw - m, ph - 12, '#E5E7EB', 0.3)
        pdf.setFontSize(6.5)
        pdf.setTextColor(150, 150, 150)
        pdf.text(`Al Reef Al Madeena | ${t('dailyExpensesReport', lang)} | ${formatDate(selectedDate + 'T00:00:00.000Z')}`, m, ph - 7)
        pdf.text(`Page ${i} of ${totalPages}`, pw - m, ph - 7, { align: 'right' })
        pdf.text('CONFIDENTIAL', pw / 2, ph - 7, { align: 'center' })
      }

      pdf.save(`Al_Reef_Daily_Report_${selectedDate}.pdf`)
      toast.success(t('exportSuccess', lang))
    } catch (error) {
      console.error('PDF Export failed:', error)
      toast.error(t('exportFailed', lang))
    } finally {
      setExportingPDF(false)
    }
  }, [selectedDate, lang, incomeItems, expenseItems, totalIncome, totalExpense, netProfitLoss])

  // ═══════════════════════════════════════════════════════════════════
  // XLSX EXPORT — Professional multi-sheet with formatting
  // ═══════════════════════════════════════════════════════════════════
  const handleExportXLSX = useCallback(() => {
    try {
      setExporting(true)
      const { company } = useDataStore.getState()
      const wb = XLSX.utils.book_new()
      const profitMargin = totalIncome > 0 ? ((netProfitLoss / totalIncome) * 100).toFixed(1) : '0'
      const isProfit = netProfitLoss >= 0

      // ─── SHEET 1: EXECUTIVE SUMMARY ───
      const summaryRows: any[][] = [
        // Row 1: Company name (merged visually)
        [company.name || 'Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C'],
        // Row 2: Report title
        [t('dailyExpensesReport', lang).toUpperCase()],
        // Row 3: Date
        [`${t('date', lang)}: ${formatDate(selectedDate + 'T00:00:00.000Z')}`, '', '', `${t('generatedOn', lang)}: ${new Date().toLocaleDateString('en-AE')}`],
        // Row 4: blank
        [],
        // Row 5: Section header
        ['FINANCIAL SUMMARY', '', '', ''],
        // Row 6: Headers
        ['Metric', 'Amount (AED)', '% of Income', 'Count'],
        // Row 7-9: Data
        [t('totalIncome', lang), totalIncome, '100%', incomeItems.length],
        [t('totalExpense', lang), totalExpense, totalIncome > 0 ? `${((totalExpense / totalIncome) * 100).toFixed(1)}%` : 'N/A', expenseItems.length],
        [t('netProfitLoss', lang), netProfitLoss, `${profitMargin}%`, ''],
        // Row 10: blank
        [],
        // Row 11: Section header
        ['PAYMENT METHOD BREAKDOWN', '', '', ''],
        // Row 12: Headers
        ['Method', 'Amount (AED)', '# Payments', 'Avg Payment'],
      ]

      // Payment method breakdown
      const methodBreakdown: Record<string, { total: number; count: number }> = {}
      for (const p of incomeItems) {
        const method = p.method || 'Unknown'
        if (!methodBreakdown[method]) methodBreakdown[method] = { total: 0, count: 0 }
        methodBreakdown[method].total += p.amount
        methodBreakdown[method].count++
      }
      for (const [method, data] of Object.entries(methodBreakdown)) {
        summaryRows.push([
          method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' '),
          data.total,
          data.count,
          data.count > 0 ? Math.round(data.total / data.count) : 0,
        ])
      }

      // Late payment stats
      const latePayments = incomeItems.filter(p => p.isLate)
      const partialPayments = incomeItems.filter(p => p.notes?.includes('Partial'))
      summaryRows.push([])
      summaryRows.push(['PAYMENT STATUS ANALYSIS', '', '', ''])
      summaryRows.push(['Status', 'Amount (AED)', '# Payments', ''])
      summaryRows.push(['On-time', incomeItems.filter(p => !p.isLate).reduce((s, p) => s + p.amount, 0), incomeItems.filter(p => !p.isLate).length, ''])
      summaryRows.push(['Late', latePayments.reduce((s, p) => s + p.amount, 0), latePayments.length, ''])
      summaryRows.push(['Partial', partialPayments.reduce((s, p) => s + p.amount, 0), partialPayments.length, ''])

      // Income by property
      const propertyBreakdown: Record<string, { total: number; count: number }> = {}
      for (const p of incomeItems) {
        if (!propertyBreakdown[p.propertyName]) propertyBreakdown[p.propertyName] = { total: 0, count: 0 }
        propertyBreakdown[p.propertyName].total += p.amount
        propertyBreakdown[p.propertyName].count++
      }
      summaryRows.push([])
      summaryRows.push(['INCOME BY PROPERTY', '', '', ''])
      summaryRows.push(['Property', 'Amount (AED)', '# Payments', 'Avg Rent'])
      for (const [prop, data] of Object.entries(propertyBreakdown).sort((a, b) => b[1].total - a[1].total)) {
        summaryRows.push([prop, data.total, data.count, data.count > 0 ? Math.round(data.total / data.count) : 0])
      }

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
      wsSummary['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 15 }, { wch: 14 }]
      // Merge company name across columns
      wsSummary['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      ]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary')

      // ─── SHEET 2: INCOME DETAILS ───
      const incomeHeader = ['#', 'Tenant Name', 'Property', 'Unit', 'Amount (AED)', 'Time', 'Method', 'Status', 'Notes']
      const incomeRows = [...incomeItems]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((item, idx) => [
          idx + 1,
          item.tenantName,
          item.propertyName,
          item.unitNumber || '',
          item.amount,
          item.time,
          item.method || '',
          item.isLate ? 'LATE' : (item.notes?.includes('Partial') ? 'PARTIAL' : 'On Time'),
          item.notes || '',
        ])

      // Add totals row
      incomeRows.push([])
      incomeRows.push(['', 'TOTAL', '', '', totalIncome, '', '', `${incomeItems.length} payments`, ''])

      const wsIncome = XLSX.utils.aoa_to_sheet([incomeHeader, ...incomeRows])
      wsIncome['!cols'] = [
        { wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 8 },
        { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 25 },
      ]
      XLSX.utils.book_append_sheet(wb, wsIncome, 'Income Details')

      // ─── SHEET 3: EXPENSE DETAILS ───
      const expenseHeader = ['#', 'Category', 'Description', 'Amount (AED)', 'Vendor', 'Time', 'Recurring', '% of Total']
      const expenseRows = [...expenseItems]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((item, idx) => [
          idx + 1,
          getExpenseCategoryLabel(item.category, 'en'),
          item.description,
          item.amount,
          item.vendor || '',
          item.time,
          item.recurring ? 'Yes' : 'No',
          totalExpense > 0 ? ((item.amount / totalExpense) * 100).toFixed(1) + '%' : '0%',
        ])

      // Add totals row
      expenseRows.push([])
      expenseRows.push(['', 'TOTAL', '', totalExpense, '', '', '', '100%'])

      const wsExpense = XLSX.utils.aoa_to_sheet([expenseHeader, ...expenseRows])
      wsExpense['!cols'] = [
        { wch: 4 }, { wch: 16 }, { wch: 36 }, { wch: 14 },
        { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, wsExpense, 'Expense Details')

      // ─── SHEET 4: CATEGORY ANALYSIS ───
      const catHeader = ['Category', 'Amount (AED)', '% of Total Expenses', '# Items', 'Avg per Item']
      const catRows = Object.entries(expenseCategoryBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => {
          const count = expenseItems.filter(e => e.category === cat).length
          return [
            getExpenseCategoryLabel(cat, 'en'),
            amt,
            totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) + '%' : '0%',
            count,
            count > 0 ? Math.round(amt / count) : 0,
          ]
        })
      catRows.push([])
      catRows.push(['TOTAL', totalExpense, '100%', expenseItems.length, ''])

      const wsCat = XLSX.utils.aoa_to_sheet([catHeader, ...catRows])
      wsCat['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsCat, 'Category Analysis')

      XLSX.writeFile(wb, `Al_Reef_Daily_Report_${selectedDate}.xlsx`)
      toast.success(t('exportSuccess', lang))
    } catch (error) {
      console.error('XLSX Export failed:', error)
      toast.error(t('exportFailed', lang))
    } finally {
      setExporting(false)
    }
  }, [selectedDate, lang, incomeItems, expenseItems, totalIncome, totalExpense, netProfitLoss])

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <ShieldAlert className="w-12 h-12 text-terracotta" />
        <h2 className="text-xl font-bold">{t('accessDenied', lang)}</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">{t('financialDataProtected', lang)}</p>
      </div>
    )
  }

  const formattedDate = formatDate(selectedDate + 'T00:00:00.000Z')
  const profitMarginPct = totalIncome > 0 ? ((netProfitLoss / totalIncome) * 100) : 0
  const collectionRate = incomeItems.length > 0 ? Math.round((incomeItems.filter(i => !i.isLate).length / incomeItems.length) * 100) : 0
  const outstandingAmount = totalIncome > 0 ? Math.max(0, totalIncome - incomeItems.filter(i => !i.isLate).reduce((s, i) => s + i.amount, 0)) : 0
  const expenseRatio = totalIncome > 0 ? ((totalExpense / totalIncome) * 100) : 0
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
          <h1 className="text-lg font-bold">{t('dailyExpensesReport', lang)}</h1>
        </div>
        <div className="text-right min-w-0">
          <p className="font-medium text-sm">{formattedDate}</p>
          <p className="text-xs text-muted-foreground hidden sm:block">{t('generatedOn', lang)}: {generatedTimestamp}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4 no-print">
        <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">
          <Button variant="ghost" size="icon" onClick={prevDay}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald" />
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-40 sm:w-44"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={nextDay}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="border-emerald text-emerald">
            {t('today', lang)}
          </Button>
        </div>
        <div className="flex items-center gap-2 mx-auto sm:mx-0">
          <Button
            onClick={handleExportXLSX}
            disabled={exporting}
            className="bg-emerald hover:bg-emerald/90 text-white"
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            {exporting ? t('loading', lang) : t('exportData', lang)}
          </Button>
          <Button
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className="bg-emerald hover:bg-emerald/90 text-white"
          >
            {exportingPDF ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {exportingPDF ? t('loading', lang) : t('exportPDF', lang)}
          </Button>
        </div>
      </div>

      {/* Executive Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Income */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-emerald" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald/10 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-emerald" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('totalIncome', lang)}</p>
            <p className="text-xl font-bold text-emerald truncate text-ellipsis overflow-hidden">{formatAED(totalIncome)}</p>
            <p className="text-xs text-muted-foreground mt-1">{incomeItems.length} {t('tenantPayment', lang)}(s)</p>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-terracotta" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-terracotta/10 flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4 text-terracotta" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('totalExpense', lang)}</p>
            <p className="text-xl font-bold text-terracotta truncate text-ellipsis overflow-hidden">{formatAED(totalExpense)}</p>
            <p className="text-xs text-muted-foreground mt-1">{expenseItems.length} {t('expensesCount', lang)}</p>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className={`h-1 ${netProfitLoss >= 0 ? 'bg-emerald' : 'bg-red-500'}`} />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-full ${netProfitLoss >= 0 ? 'bg-emerald/10' : 'bg-red-100'} flex items-center justify-center`}>
                <DollarSign className={`w-4 h-4 ${netProfitLoss >= 0 ? 'text-emerald' : 'text-red-500'}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('netProfitLoss', lang)}</p>
            <p className={`text-xl font-bold truncate text-ellipsis overflow-hidden ${netProfitLoss >= 0 ? 'text-emerald' : 'text-red-600'}`}>
              {formatAED(netProfitLoss)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{netProfitLoss >= 0 ? 'PROFIT' : 'LOSS'}</p>
          </CardContent>
        </Card>

        {/* Collection Rate */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-deep-teal" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-deep-teal/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-deep-teal" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('collectionRate', lang)}</p>
            <p className="text-xl font-bold text-deep-teal">{collectionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{incomeItems.filter(i => !i.isLate).length} {t('tenantPayment', lang)}(s) {t('onTime', lang)}</p>
          </CardContent>
        </Card>

        {/* Number of Payments */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-gold" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-gold" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('tenantPayment', lang)}(s)</p>
            <p className="text-xl font-bold text-foreground">{incomeItems.length + expenseItems.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalIncome > 0 ? `${((totalExpense / totalIncome) * 100).toFixed(0)}% ${t('debits', lang).toLowerCase()}` : '—'}</p>
          </CardContent>
        </Card>

        {/* Outstanding Amounts */}
        <Card className="card-hover overflow-hidden print:bg-white print:border">
          <div className="h-1 bg-amber-500" />
          <CardContent className="p-3 sm:p-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{t('outstanding', lang)}</p>
            <p className="text-xl font-bold text-amber-600 truncate text-ellipsis overflow-hidden">{formatAED(outstandingAmount)}</p>
            <p className="text-xs text-muted-foreground mt-1">{incomeItems.filter(i => i.isLate).length} {t('late', lang).toLowerCase()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses Bar Chart */}
        <Card ref={barChartRef}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('incomeVsExpenses', lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatAED(value)} contentStyle={{ backgroundColor: '#FFF8E7', border: '1px solid #e5e0d5', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Distribution Pie Chart */}
        <Card ref={pieChartRef}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('expenseDistribution', lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAED(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                <Receipt className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">{t('noExpensesFound', lang)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profitability Analysis Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald" />
            {t('profitAndLoss', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Financial Breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('financialSummary', lang)}</h4>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald" />
                  <span className="text-sm font-medium min-w-0 truncate">{t('totalIncome', lang)}</span>
                </div>
                <span className="font-bold text-emerald shrink-0">{formatAED(totalIncome)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-50 to-orange-100/50">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-terracotta" />
                  <span className="text-sm font-medium min-w-0 truncate">{t('totalExpense', lang)}</span>
                </div>
                <span className="font-bold text-terracotta shrink-0">{formatAED(totalExpense)}</span>
              </div>
              <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${netProfitLoss >= 0 ? 'border-emerald bg-gradient-to-r from-emerald-50 to-emerald-100/30' : 'border-red-300 bg-gradient-to-r from-red-50 to-red-100/30'}`}>
                <div className="flex items-center gap-2">
                  {netProfitLoss >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald" /> : <ArrowDownRight className="w-5 h-5 text-red-500" />}
                  <span className="text-base font-bold">{t('netProfitLoss', lang)}</span>
                </div>
                <span className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-emerald' : 'text-red-600'}`}>{formatAED(netProfitLoss)}</span>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Performance Metrics</h4>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('profitOrLoss', lang)} %</span>
                  <span className={`text-sm font-bold ${netProfitLoss >= 0 ? 'text-emerald' : 'text-red-600'}`}>{profitMarginPct.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(Math.max(Math.abs(profitMarginPct), 0), 100)} className="h-2 [&>div]:bg-emerald" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('collectionRate', lang)}</span>
                  <span className="text-sm font-bold text-deep-teal">{collectionRate}%</span>
                </div>
                <Progress value={collectionRate} className="h-2 [&>div]:bg-deep-teal" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{t('debits', lang)} / {t('income', lang)}</span>
                  <span className="text-sm font-bold text-terracotta">{expenseRatio.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(expenseRatio, 100)} className="h-2 [&>div]:bg-terracotta" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Income Details Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-emerald" />
              {t('income', lang)} — {t('rentCollected', lang)}
            </CardTitle>
            {incomeItems.length > 0 && (
              <Badge className="bg-emerald/10 text-emerald border-emerald/20">{formatAED(totalIncome)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {incomeItems.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-emerald/5 hover:bg-emerald/10">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{t('tenantName', lang)}</TableHead>
                    <TableHead>{t('property', lang)}</TableHead>
                    <TableHead className="w-20">{t('unitNumber', lang)}</TableHead>
                    <TableHead className="text-right">{t('amount', lang)}</TableHead>
                    <TableHead className="w-20">{t('paymentTime', lang)}</TableHead>
                    <TableHead className="w-28">{t('paymentMethod', lang)}</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...incomeItems].sort((a, b) => a.time.localeCompare(b.time)).map((item, idx) => (
                    <TableRow key={idx} className={`${item.isLate ? 'bg-red-50/50 border-l-3 border-l-red-400' : ''} ${item.source === 'reservation' ? 'bg-sky-50/30' : ''}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm max-w-[120px] truncate">{item.tenantName}</p>
                          {item.source === 'reservation' && (
                            <Badge variant="outline" className="text-[10px] border-sky-400 text-sky-700 px-1 py-0 shrink-0">Reservation</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground max-w-[120px] truncate">{item.propertyName}</p>
                      </TableCell>
                      <TableCell>
                        {item.unitNumber ? (
                          <Badge variant="outline" className="text-xs font-mono">{item.unitNumber}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <p className={item.amount < 0 ? 'font-bold text-red-600' : 'font-bold text-emerald'}>{formatAED(item.amount)}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.time}</TableCell>
                      <TableCell>
                        {item.method === 'reservation_deposit' ? (
                          <Badge variant="secondary" className="text-xs font-normal bg-sky-100 text-sky-700">Deposit</Badge>
                        ) : item.method === 'reservation_refund' ? (
                          <Badge variant="secondary" className="text-xs font-normal bg-red-100 text-red-700">Refund</Badge>
                        ) : item.method ? (
                          <Badge variant="secondary" className="text-xs font-normal inline-block max-w-[80px] truncate">{item.method}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.isLate ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs inline-block max-w-[80px] truncate">Late</Badge>
                        ) : item.notes?.includes('Partial') ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs inline-block max-w-[80px] truncate">Partial</Badge>
                        ) : item.amount < 0 ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs inline-block max-w-[80px] truncate">Refund</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs inline-block max-w-[80px] truncate">Paid</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Income Total Row */}
                  <TableRow className="bg-emerald/10 hover:bg-emerald/15 font-bold">
                    <TableCell colSpan={4} className="font-bold text-emerald">{t('totalIncome', lang)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald">{formatAED(totalIncome)}</TableCell>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground">{incomeItems.length} {t('tenantPayment', lang)}(s)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">{t('noTransactionsToday', lang)}</p>
              <p className="text-xs mt-1">Income will appear here when payments are recorded</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expense Details Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowDownRight className="w-5 h-5 text-terracotta" />
              {t('debits', lang)}
            </CardTitle>
            {expenseItems.length > 0 && (
              <Badge className="bg-terracotta/10 text-terracotta border-terracotta/20">{formatAED(totalExpense)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {expenseItems.length > 0 ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-terracotta/5 hover:bg-terracotta/10">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{t('expenseCategory', lang)}</TableHead>
                    <TableHead>{t('description', lang)}</TableHead>
                    <TableHead className="text-right">{t('amount', lang)}</TableHead>
                    <TableHead>{t('vendor', lang)}</TableHead>
                    <TableHead className="w-20">{t('paymentTime', lang)}</TableHead>
                    <TableHead className="w-20">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...expenseItems].sort((a, b) => a.time.localeCompare(b.time)).map((item, idx) => {
                    const catColor = CATEGORY_COLORS[item.category]?.fill || '#6b7280'
                    return (
                      <TableRow key={item.id} className="border-l-3" style={{ borderLeftColor: catColor }}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                            <Badge variant="secondary" className="text-xs font-normal inline-block max-w-[80px] truncate">{getExpenseCategoryLabel(item.category, lang)}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium max-w-[150px] truncate">{item.description}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold text-terracotta">{formatAED(item.amount)}</p>
                        </TableCell>
                        <TableCell>
                          {item.vendor ? (
                            <p className="text-sm max-w-[100px] truncate">{item.vendor}</p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.time}</TableCell>
                        <TableCell>
                          {item.recurring ? (
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
                    <TableCell colSpan={3} className="font-bold text-terracotta">{t('totalExpense', lang)}</TableCell>
                    <TableCell className="text-right font-bold text-terracotta">{formatAED(totalExpense)}</TableCell>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground">{expenseItems.length} {t('expensesCount', lang)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">{t('noTransactionsToday', lang)}</p>
              <p className="text-xs mt-1">Expenses will appear here when they are added</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
