'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { RecurringBillData, BillPaymentData, BillCycleData, PropertyData } from '@/lib/types'
import { useAppStore, isOwnerOrAdmin } from '@/lib/store'
import { formatAED, formatDate } from '@/lib/utils'
import { t, getServiceTypeLabel, getFrequencyLabel, getNameByLang, getMonthName, type Language } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Zap, Plus, Pencil, Trash2, CreditCard, FastForward, Loader2, ShieldAlert, Search, AlertTriangle, FileDown, FileSpreadsheet, Calendar, X, History, ChevronRight, ChevronLeft } from 'lucide-react'

const SERVICE_TYPES = [
  'electricity', 'water', 'etisalat', 'du', 'internet',
  'municipality', 'service_charge', 'waste',
  'maintenance_contract', 'security_contract', 'cleaning_contract', 'custom',
] as const

const BILLING_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online'] as const

type TabType = 'all' | 'upcoming' | 'overdue' | 'paid' | 'partially_paid' | 'outstanding' | 'due_soon' | 'custom_range' | 'payments'
type DatePreset = '7d' | '30d' | 'quarter' | 'year' | 'custom'

const emptyBillForm = {
  propertyId: '',
  providerName: '',
  serviceType: 'electricity',
  accountNumber: '',
  contractNumber: '',
  currentOutstanding: 0,
  nextDueDate: new Date().toISOString().split('T')[0],
  billingFrequency: 'monthly',
  autoRenew: true,
  gracePeriodDays: 0,
  buildingName: '',
  ownerName: '',
  propertyManager: '',
  notes: '',
}

const emptyPaymentForm = {
  amount: 0,
  paymentDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'bank_transfer',
  reference: '',
  notes: '',
}

export default function RecurringBills() {
  const { language, authUser } = useAppStore()
  const lang = language as Language

  const [bills, setBills] = useState<RecurringBillData[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState('all')

  // Monthly billing cycle context
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }
  })

  // Date range filter
  const [datePreset, setDatePreset] = useState<DatePreset>('30d')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [dateRangeOpen, setDateRangeOpen] = useState(false)

  // Dialogs
  const [billDialogOpen, setBillDialogOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [editPaymentDialogOpen, setEditPaymentDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringBillData | null>(null)
  const [payingBill, setPayingBill] = useState<RecurringBillData | null>(null)
  const [historyBill, setHistoryBill] = useState<RecurringBillData | null>(null)
  const [payments, setPayments] = useState<BillPaymentData[]>([])
  const [allPayments, setAllPayments] = useState<BillPaymentData[]>([])
  const [allPaymentsTotal, setAllPaymentsTotal] = useState(0)
  const [editingPayment, setEditingPayment] = useState<BillPaymentData | null>(null)

  // Cycle-related state
  const [billCycles, setBillCycles] = useState<BillCycleData[]>([])
  const [cyclesDialogOpen, setCyclesDialogOpen] = useState(false)
  const [cyclesBill, setCyclesBill] = useState<RecurringBillData | null>(null)
  const [newCycleDialogOpen, setNewCycleDialogOpen] = useState(false)
  const [newCycleAmount, setNewCycleAmount] = useState(0)
  const [newCycleBill, setNewCycleBill] = useState<RecurringBillData | null>(null)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)

  // Forms
  const [billForm, setBillForm] = useState({ ...emptyBillForm })
  const [paymentForm, setPaymentForm] = useState({ ...emptyPaymentForm })
  const [editPaymentForm, setEditPaymentForm] = useState({ ...emptyPaymentForm })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Account number duplicate check
  const [accountNumberWarning, setAccountNumberWarning] = useState<string | null>(null)
  const [checkingAccount, setCheckingAccount] = useState(false)
  const accountCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Access control
  const canAccess = !!authUser
  const canModify = authUser && isOwnerOrAdmin(authUser.role)
  const isFinancial = authUser && isOwnerOrAdmin(authUser.role)

  // Fetch bills
  const fetchBills = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '1000')
      params.set('month', String(selectedMonth.month))
      params.set('year', String(selectedMonth.year))

      // Server-side filters for basic tabs
      if (activeTab === 'upcoming') {
        params.set('upcoming', 'true')
      } else if (activeTab === 'overdue') {
        params.set('overdue', 'true')
      }

      // Service type filter
      if (serviceFilter !== 'all') {
        params.set('serviceType', serviceFilter)
      }

      // Date range filter
      if (activeTab === 'custom_range' && customDateFrom) {
        params.set('dateFrom', customDateFrom)
      }
      if (activeTab === 'custom_range' && customDateTo) {
        params.set('dateTo', customDateTo)
      }

      const summaryParams = new URLSearchParams()
      summaryParams.set('month', String(selectedMonth.month))
      summaryParams.set('year', String(selectedMonth.year))

      const [billsRes, summaryRes, propsRes] = await Promise.all([
        fetch(`/api/recurring-bills?${params.toString()}`),
        fetch(`/api/recurring-bills/summary?${summaryParams.toString()}`),
        fetch('/api/properties?limit=1000'),
      ])

      if (billsRes.ok) {
        const data = await billsRes.json()
        const billList = data.data?.data || data.data || data || []
        setBills(Array.isArray(billList) ? billList : [])
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.data || data || null)
      }
      if (propsRes.ok) {
        const data = await propsRes.json()
        const propList = data.data?.data || data.data || data || []
        const sorted = Array.isArray(propList) ? [...propList].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')) : []
        setProperties(sorted)
      }
    } catch (e) {
      console.error('Failed to fetch bills:', e)
    } finally {
      setLoading(false)
    }
  }, [activeTab, serviceFilter, customDateFrom, customDateTo, selectedMonth])

  useEffect(() => { fetchBills() }, [fetchBills])

  // Fetch all payments when on the payments tab
  const fetchAllPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', '1000')
      params.set('month', String(selectedMonth.month))
      params.set('year', String(selectedMonth.year))
      if (serviceFilter !== 'all') params.set('serviceType', serviceFilter)
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/recurring-bills/payments?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const paymentList = data.data?.data || data.data || data || []
        setAllPayments(Array.isArray(paymentList) ? paymentList : [])
        setAllPaymentsTotal(data.data?.pagination?.total || paymentList.length || 0)
      }
    } catch (e) {
      console.error('Failed to fetch all payments:', e)
    }
  }, [serviceFilter, searchQuery, selectedMonth])

  useEffect(() => {
    if (activeTab === 'payments') fetchAllPayments()
  }, [activeTab, fetchAllPayments])

  // ─── Client-side category filters ───
  // ARCHITECTURE: bill.currentOutstanding is the SOLE source of truth.
  // bill.nextDueDate is the SOLE source of truth for date classification.
  // No cycle-level aggregation is used for classification or totals.
  const now = new Date()

  // Helper: safely get outstanding from bill.currentOutstanding
  const getBillOutstanding = (bill: RecurringBillData): number => {
    return parseFloat(String(bill.currentOutstanding)) || 0
  }

  // Helper: check if a bill has any actual payment records
  const hasBillPayments = (bill: RecurringBillData): boolean => {
    if (bill.lastPaymentDate) return true
    if (bill.cycles && bill.cycles.length > 0) {
      return bill.cycles.some((c: any) =>
        parseFloat(String(c.paidAmount)) > 0 || (c._count?.payments ?? 0) > 0
      )
    }
    return false
  }

  const isOverdue = (bill: RecurringBillData) => {
    if (bill.status !== 'active') return false
    // bill.nextDueDate is SOLE source of truth for date classification
    // Overdue ONLY IF: currentDate > nextDueDate (same-day is NOT overdue)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(new Date(bill.nextDueDate).getFullYear(), new Date(bill.nextDueDate).getMonth(), new Date(bill.nextDueDate).getDate())
    return dueDay < today
  }

  const isUpcoming = (bill: RecurringBillData) => {
    if (bill.status !== 'active') return false
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(new Date(bill.nextDueDate).getFullYear(), new Date(bill.nextDueDate).getMonth(), new Date(bill.nextDueDate).getDate())
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    return dueDay >= today && dueDay <= thirtyDays
  }

  const isDueSoon = (bill: RecurringBillData) => {
    if (bill.status !== 'active') return false
    // Due Soon ONLY IF: 0 <= (nextDueDate - currentDate) <= 7 days
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(new Date(bill.nextDueDate).getFullYear(), new Date(bill.nextDueDate).getMonth(), new Date(bill.nextDueDate).getDate())
    const sevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    return dueDay >= today && dueDay <= sevenDays
  }

  // PAID = outstanding <= 0 AND has actual payment records
  const isPaid = (bill: RecurringBillData) => {
    return bill.status === 'active' && getBillOutstanding(bill) <= 0 && hasBillPayments(bill)
  }

  // PARTIALLY PAID = outstanding > 0 AND has actual payment records
  const isPartiallyPaid = (bill: RecurringBillData) => {
    return bill.status === 'active' && getBillOutstanding(bill) > 0 && hasBillPayments(bill)
  }

  // OUTSTANDING = outstanding > 0 (regardless of payment status)
  const isOutstanding = (bill: RecurringBillData) => {
    return bill.status === 'active' && getBillOutstanding(bill) > 0
  }

  const isInDateRange = (bill: RecurringBillData) => {
    if (activeTab !== 'custom_range') return true
    const due = new Date(bill.nextDueDate)
    const from = customDateFrom ? new Date(customDateFrom) : null
    const to = customDateTo ? new Date(customDateTo + 'T23:59:59.999') : null
    if (from && due < from) return false
    if (to && due > to) return false
    return true
  }

  // Filtered bills based on active tab
  const tabFiltered = bills.filter(bill => {
    switch (activeTab) {
      case 'upcoming': return isUpcoming(bill)
      case 'overdue': return isOverdue(bill)
      case 'paid': return isPaid(bill)
      case 'partially_paid': return isPartiallyPaid(bill)
      case 'outstanding': return isOutstanding(bill)
      case 'due_soon': return isDueSoon(bill)
      case 'custom_range': return isInDateRange(bill)
      default: return true
    }
  })

  // Search filter (applied on top of tab filter)
  const filtered = tabFiltered.filter(bill => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      bill.providerName?.toLowerCase().includes(q) ||
      bill.buildingName?.toLowerCase().includes(q) ||
      bill.ownerName?.toLowerCase().includes(q) ||
      bill.propertyManager?.toLowerCase().includes(q) ||
      bill.accountNumber?.toLowerCase().includes(q) ||
      bill.contractNumber?.toLowerCase().includes(q) ||
      bill.serviceType?.toLowerCase().includes(q) ||
      (bill.property && getNameByLang(bill.property, lang).toLowerCase().includes(q))
    )
  })

  // ─── Sorting: Building > Unit > Service Type ───
  const SERVICE_TYPE_SORT: Record<string, number> = {
    electricity: 1, water: 2, etisalat: 3, du: 4, internet: 5,
    municipality: 6, service_charge: 7, waste: 8, maintenance_contract: 9,
    security_contract: 10, cleaning_contract: 11, custom: 12,
  }

  const sortBills = (a: RecurringBillData, b: RecurringBillData): number => {
    // Primary: Property name (building)
    const buildingA = a.property ? getNameByLang(a.property, lang).toLowerCase() : (a.buildingName || '').toLowerCase()
    const buildingB = b.property ? getNameByLang(b.property, lang).toLowerCase() : (b.buildingName || '').toLowerCase()
    if (buildingA < buildingB) return -1
    if (buildingA > buildingB) return 1

    // Secondary: buildingName field (for sub-units within the same property)
    const bnA = (a.buildingName || '').toLowerCase()
    const bnB = (b.buildingName || '').toLowerCase()
    if (bnA < bnB) return -1
    if (bnA > bnB) return 1

    // Tertiary: Service type
    const stA = SERVICE_TYPE_SORT[a.serviceType] || 99
    const stB = SERVICE_TYPE_SORT[b.serviceType] || 99
    return stA - stB
  }

  const sortedFiltered = [...filtered].sort(sortBills)

  // ─── Month navigation ───
  const navigateMonth = (delta: number) => {
    setSelectedMonth(prev => {
      let newMonth = prev.month + delta
      let newYear = prev.year
      if (newMonth > 12) { newMonth = 1; newYear++ }
      if (newMonth < 1) { newMonth = 12; newYear-- }
      return { month: newMonth, year: newYear }
    })
  }

  const quickNav = (target: 'prev' | 'current' | 'next') => {
    if (target === 'current') {
      const now = new Date()
      setSelectedMonth({ month: now.getMonth() + 1, year: now.getFullYear() })
    } else {
      navigateMonth(target === 'prev' ? -1 : 1)
    }
  }

  // ─── Count helpers ───
  const paidCount = bills.filter(b => isPaid(b)).length
  const partiallyPaidCount = bills.filter(b => isPartiallyPaid(b)).length
  const outstandingCount = bills.filter(b => isOutstanding(b)).length
  const dueSoonCount = bills.filter(b => isDueSoon(b)).length
  // ARCHITECTURE: overdueCount uses bill.nextDueDate as SOLE source of truth
  // Summary API now uses the same canonical logic
  const overdueCount = summary?.overdueCount ?? bills.filter(b => isOverdue(b)).length
  const upcomingCount = bills.filter(b => isUpcoming(b)).length

  // ─── Handlers ───
  const openNew = () => {
    setEditing(null)
    setBillForm({ ...emptyBillForm })
    setAccountNumberWarning(null)
    setBillDialogOpen(true)
  }

  const openEdit = (bill: RecurringBillData) => {
    setEditing(bill)
    setBillForm({
      propertyId: bill.propertyId,
      providerName: bill.providerName,
      serviceType: bill.serviceType,
      accountNumber: bill.accountNumber || '',
      contractNumber: bill.contractNumber || '',
      currentOutstanding: bill.currentOutstanding,
      nextDueDate: new Date(bill.nextDueDate).toISOString().split('T')[0],
      billingFrequency: bill.billingFrequency,
      autoRenew: bill.autoRenew,
      gracePeriodDays: bill.gracePeriodDays,
      buildingName: bill.buildingName || '',
      ownerName: bill.ownerName || '',
      propertyManager: bill.propertyManager || '',
      notes: bill.notes || '',
    })
    setAccountNumberWarning(null)
    setBillDialogOpen(true)
  }

  const openPayment = (bill: RecurringBillData) => {
    setPayingBill(bill)
    setSelectedCycleId(null)
    setPaymentForm({ ...emptyPaymentForm, amount: bill.totalAmountDue || bill.currentOutstanding })
    setPaymentDialogOpen(true)
  }

  const fetchCycles = async (billId: string) => {
    try {
      const res = await fetch(`/api/recurring-bills/${billId}/cycles?limit=50`)
      if (res.ok) {
        const data = await res.json()
        const cycleList = data.data?.data || data.data || data || []
        setBillCycles(Array.isArray(cycleList) ? cycleList : [])
      }
    } catch (e) {
      console.error('Failed to fetch cycles:', e)
    }
  }

  const openCyclesDialog = (bill: RecurringBillData) => {
    setCyclesBill(bill)
    setCyclesDialogOpen(true)
    fetchCycles(bill.id)
  }

  const openNewCycleDialog = (bill: RecurringBillData) => {
    setNewCycleBill(bill)
    setNewCycleAmount(bill.totalAmountDue || bill.currentOutstanding || 0)
    setNewCycleDialogOpen(true)
  }

  const openHistory = async (bill: RecurringBillData) => {
    setHistoryBill(bill)
    setHistoryDialogOpen(true)
    try {
      const res = await fetch(`/api/recurring-bills/${bill.id}/payments?limit=50`)
      if (res.ok) {
        const data = await res.json()
        setPayments(Array.isArray(data.data?.data || data.data || data) ? (data.data?.data || data.data || data) : [])
      }
    } catch (e) {
      console.error('Failed to fetch payments:', e)
    }
  }

  const handleSaveBill = async () => {
    setSaving(true)
    try {
      const body = {
        ...billForm,
        currentOutstanding: Number(billForm.currentOutstanding),
        gracePeriodDays: Number(billForm.gracePeriodDays),
        accountNumber: billForm.accountNumber || null,
        contractNumber: billForm.contractNumber || null,
        buildingName: billForm.buildingName || null,
        ownerName: billForm.ownerName || null,
        propertyManager: billForm.propertyManager || null,
        notes: billForm.notes || null,
      }

      if (editing) {
        const res = await fetch(`/api/recurring-bills/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          if (res.status === 409) {
            alert(`⚠️ Duplicate Account Number\n\n${err.error}`)
          } else {
            alert(err.error || 'Failed to update bill')
          }
          setSaving(false)
          return
        }
      } else {
        const res = await fetch('/api/recurring-bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          if (res.status === 409) {
            alert(`⚠️ Duplicate Account Number\n\n${err.error}`)
          } else {
            alert(err.error || 'Failed to create bill')
          }
          setSaving(false)
          return
        }
      }
      setBillDialogOpen(false)
      setAccountNumberWarning(null)
      fetchBills()
    } catch (error) {
      console.error('Failed to save bill:', error)
      alert('Failed to save bill. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!payingBill) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recurring-bills/${payingBill.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paymentDate: paymentForm.paymentDate,
          paymentMethod: paymentForm.paymentMethod,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null,
          billCycleId: selectedCycleId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to record payment')
        setSaving(false)
        return
      }
      setPaymentDialogOpen(false)
      fetchBills()
    } catch (error) {
      console.error('Failed to record payment:', error)
      alert('Failed to record payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAdvanceCycle = async () => {
    if (!newCycleBill) return
    setSaving(true)
    try {
      const res = await fetch('/api/recurring-bills/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: newCycleBill.id, newAmount: newCycleAmount }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to advance cycle')
        setSaving(false)
        return
      }
      setNewCycleDialogOpen(false)
      setNewCycleBill(null)
      fetchBills()
    } catch (error) {
      console.error('Failed to advance cycle:', error)
      alert('Failed to advance cycle. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteExpense', lang))) return
    try {
      const res = await fetch(`/api/recurring-bills/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert('Failed to delete bill')
        return
      }
      fetchBills()
    } catch (error) {
      console.error('Failed to delete bill:', error)
      alert('Failed to delete bill. Please try again.')
    }
  }

  const openEditPayment = (payment: BillPaymentData) => {
    setEditingPayment(payment)
    setEditPaymentForm({
      amount: payment.amount,
      paymentDate: new Date(payment.paymentDate).toISOString().split('T')[0],
      paymentMethod: payment.paymentMethod || 'bank_transfer',
      reference: payment.reference || '',
      notes: payment.notes || '',
    })
    setEditPaymentDialogOpen(true)
  }

  const handleEditPayment = async () => {
    if (!editingPayment) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recurring-bills/payments/${editingPayment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(editPaymentForm.amount),
          paymentDate: editPaymentForm.paymentDate,
          paymentMethod: editPaymentForm.paymentMethod,
          reference: editPaymentForm.reference || null,
          notes: editPaymentForm.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to update payment')
        setSaving(false)
        return
      }
      setEditPaymentDialogOpen(false)
      setEditingPayment(null)
      // Refresh both payments list and bills
      fetchAllPayments()
      fetchBills()
    } catch (error) {
      console.error('Failed to edit payment:', error)
      alert('Failed to edit payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePayment = async (payment: BillPaymentData) => {
    if (!confirm(t('deletePaymentConfirm', lang))) return
    try {
      const res = await fetch(`/api/recurring-bills/payments/${payment.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to delete payment')
        return
      }
      // Refresh both payments list and bills
      fetchAllPayments()
      fetchBills()
    } catch (error) {
      console.error('Failed to delete payment:', error)
      alert('Failed to delete payment. Please try again.')
    }
  }

  // ─── Export handlers ───
  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('month', String(selectedMonth.month))
      params.set('year', String(selectedMonth.year))
      if (serviceFilter !== 'all') params.set('serviceType', serviceFilter)
      if (activeTab === 'custom_range' && customDateFrom) params.set('dateFrom', customDateFrom)
      if (activeTab === 'custom_range' && customDateTo) params.set('dateTo', customDateTo)

      const res = await fetch(`/api/recurring-bills/export/pdf?${params.toString()}`)
      if (!res.ok) {
        alert('Failed to export PDF')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recurring-bills-report-${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportXLSX = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('month', String(selectedMonth.month))
      params.set('year', String(selectedMonth.year))
      if (serviceFilter !== 'all') params.set('serviceType', serviceFilter)
      if (activeTab === 'custom_range' && customDateFrom) params.set('dateFrom', customDateFrom)
      if (activeTab === 'custom_range' && customDateTo) params.set('dateTo', customDateTo)

      const res = await fetch(`/api/recurring-bills/export/xlsx?${params.toString()}`)
      if (!res.ok) {
        alert('Failed to export Excel')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recurring-bills-report-${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export XLSX:', error)
      alert('Failed to export Excel. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ─── Helpers ───
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">{t('active', lang)}</Badge>
      case 'paused': return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{t('pending', lang)}</Badge>
      case 'cancelled': return <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">{t('terminated', lang)}</Badge>
      default: return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  const getOverdueDays = (dueDate: string): number => {
    const due = new Date(dueDate)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    const diff = today.getTime() - dueDay.getTime()
    const days = Math.round(diff / (1000 * 60 * 60 * 24))
    // NEVER return 0 days overdue — if diff is 0, the bill is due today, NOT overdue
    return days > 0 ? days : 0
  }

  const getDaysRemaining = (dueDate: string): number => {
    const due = new Date(dueDate)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    const diff = dueDay.getTime() - today.getTime()
    const days = Math.round(diff / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const displayAmount = (amount: number) => {
    if (!isFinancial) return '***'
    return formatAED(amount)
  }

  // Summary stats
  const totalBills = summary?.totalBills ?? bills.filter(b => b.status === 'active').length
  const totalOutstanding = summary?.totalOutstanding ?? bills.reduce((s, b) => s + b.currentOutstanding, 0)
  const totalPaidThisMonth = summary?.totalPaidThisMonth ?? 0

  // Date preset handler
  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset)
    const today = new Date()
    if (preset === '7d') {
      setCustomDateFrom(today.toISOString().split('T')[0])
      const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      setCustomDateTo(end.toISOString().split('T')[0])
    } else if (preset === '30d') {
      setCustomDateFrom(today.toISOString().split('T')[0])
      const end = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      setCustomDateTo(end.toISOString().split('T')[0])
    } else if (preset === 'quarter') {
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
      const qEnd = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)
      setCustomDateFrom(qStart.toISOString().split('T')[0])
      setCustomDateTo(qEnd.toISOString().split('T')[0])
    } else if (preset === 'year') {
      setCustomDateFrom(`${today.getFullYear()}-01-01`)
      setCustomDateTo(`${today.getFullYear()}-12-31`)
    }
    // 'custom' just opens the date inputs, no auto-fill
  }

  if (loading && bills.length === 0) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald" />
            {t('recurringBillsAndUtilities', lang)}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalBills} {t('recurringBills', lang).toLowerCase()} — {getMonthName(selectedMonth.month, lang)} {selectedMonth.year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isFinancial && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={exporting || bills.length === 0}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                {t('exportPDF', lang)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportXLSX}
                disabled={exporting || bills.length === 0}
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />}
                {t('exportXLSX', lang)}
              </Button>
            </>
          )}
          <Button onClick={openNew} className="bg-emerald hover:bg-emerald/90 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t('addRecurringBill', lang)}
          </Button>
        </div>
      </div>

      {/* Monthly Billing Cycle Navigation */}
      <div className="flex items-center justify-center gap-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center min-w-[160px]">
          <p className="text-lg font-bold">{getMonthName(selectedMonth.month, lang)} {selectedMonth.year}</p>
          {summary?.isCurrentMonth && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs">{t('currentMonth', lang) || 'Current'}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {/* Quick month buttons: prev month, current month, next month */}
        <div className="flex gap-1 ml-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => quickNav('prev')}>
            {getMonthName(selectedMonth.month === 1 ? 12 : selectedMonth.month - 1, lang)}
          </Button>
          <Button variant="default" size="sm" className="text-xs h-7 bg-emerald hover:bg-emerald/90" onClick={() => quickNav('current')}>
            {t('currentMonth', lang) || 'Current'}
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => quickNav('next')}>
            {getMonthName(selectedMonth.month === 12 ? 1 : selectedMonth.month + 1, lang)}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('recurringBills', lang)}</p>
            <p className="text-2xl font-bold mt-1">{totalBills}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('totalOutstanding', lang)}</p>
            <p className="text-lg font-bold mt-1 text-terracotta">{displayAmount(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('totalPaid', lang)}</p>
            <p className="text-lg font-bold mt-1 text-emerald">{displayAmount(totalPaidThisMonth)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('overdueBills', lang)}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              {overdueCount > 0 && <AlertTriangle className="w-5 h-5 text-red-500" />}
            </div>
            {overdueCount > 0 && summary?.totalOverdueAmount && isFinancial && (
              <p className="text-xs text-red-500 mt-0.5">{formatAED(summary.totalOverdueAmount)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service Type Breakdown */}
      {summary?.serviceTypeBreakdown?.length > 0 && isFinancial && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {summary.serviceTypeBreakdown
            .sort((a: any, b: any) => (b.totalAmountDue || 0) - (a.totalAmountDue || 0))
            .map((item: any) => (
              <Card key={item.serviceType} className="card-hover">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">
                    {getServiceTypeLabel(item.serviceType, lang)}
                  </p>
                  <p className="text-lg font-bold mt-1">{formatAED(item.totalAmountDue || 0)}</p>
                  <p className="text-xs text-muted-foreground">{item.count} {t('recurringBills', lang).toLowerCase()}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('all')}
          className={activeTab === 'all' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
        >
          {t('all', lang)}
        </Button>
        <Button
          variant={activeTab === 'upcoming' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('upcoming')}
          className={activeTab === 'upcoming' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
        >
          {t('upcomingBills', lang)}
          {upcomingCount > 0 && <Badge className="ml-2 bg-white/20 text-xs">{upcomingCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'overdue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('overdue')}
          className={activeTab === 'overdue' ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
        >
          {t('overdueBills', lang)}
          {overdueCount > 0 && <Badge className="ml-2 bg-white text-red-600 text-xs">{overdueCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'paid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('paid')}
          className={activeTab === 'paid' ? 'bg-emerald hover:bg-emerald/90 text-white' : ''}
        >
          {t('paidBills', lang)}
          {paidCount > 0 && <Badge className="ml-2 bg-white/20 text-xs">{paidCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'partially_paid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('partially_paid')}
          className={activeTab === 'partially_paid' ? 'bg-purple-500 hover:bg-purple-600 text-white' : ''}
        >
          {t('partiallyPaidBills', lang)}
          {partiallyPaidCount > 0 && <Badge className="ml-2 bg-white/20 text-xs">{partiallyPaidCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'outstanding' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('outstanding')}
          className={activeTab === 'outstanding' ? 'bg-terracotta hover:bg-terracotta/90 text-white' : ''}
        >
          {t('outstandingBills', lang)}
          {outstandingCount > 0 && <Badge className="ml-2 bg-white/20 text-xs">{outstandingCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'due_soon' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('due_soon')}
          className={activeTab === 'due_soon' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
        >
          {t('dueSoonBills', lang)}
          {dueSoonCount > 0 && <Badge className="ml-2 bg-white/20 text-xs">{dueSoonCount}</Badge>}
        </Button>

        {/* All Payments Tab */}
        {isFinancial && (
          <Button
            variant={activeTab === 'payments' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('payments')}
            className={activeTab === 'payments' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
          >
            <CreditCard className="w-3.5 h-3.5 mr-1" />
            {t('allPayments', lang)}
            {allPaymentsTotal > 0 && <Badge className="ml-2 bg-white/20 text-xs">{allPaymentsTotal}</Badge>}
          </Button>
        )}

        {/* Custom Date Range Tab with Popover */}
        <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={activeTab === 'custom_range' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setActiveTab('custom_range')
                setDateRangeOpen(true)
              }}
              className={activeTab === 'custom_range' ? 'bg-deep-teal hover:bg-deep-teal/90 text-white' : ''}
            >
              <Calendar className="w-3.5 h-3.5 mr-1" />
              {t('customDateRange', lang)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="text-sm font-medium">{t('customDateRange', lang)}</div>

              {/* Date Presets */}
              <div className="flex gap-1 flex-wrap">
                {([
                  { key: '7d', label: t('last7Days', lang) },
                  { key: '30d', label: t('last30Days', lang) },
                  { key: 'quarter', label: t('thisQuarter', lang) },
                  { key: 'year', label: t('thisYear', lang) },
                ] as const).map(preset => (
                  <Button
                    key={preset.key}
                    variant={datePreset === preset.key ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => applyDatePreset(preset.key)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t('dateFrom', lang)}</Label>
                  <Input
                    type="date"
                    value={customDateFrom}
                    onChange={e => { setCustomDateFrom(e.target.value); setDatePreset('custom') }}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('dateTo', lang)}</Label>
                  <Input
                    type="date"
                    value={customDateTo}
                    onChange={e => { setCustomDateTo(e.target.value); setDatePreset('custom') }}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald hover:bg-emerald/90 text-white"
                  onClick={() => { fetchBills(); setDateRangeOpen(false) }}
                >
                  {t('applyFilter', lang)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomDateFrom('')
                    setCustomDateTo('')
                    setDatePreset('30d')
                  }}
                >
                  {t('clearFilter', lang)}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchBills', lang)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={serviceFilter} onValueChange={v => setServiceFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('serviceType', lang)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all', lang)}</SelectItem>
            {SERVICE_TYPES.map(st => (
              <SelectItem key={st} value={st}>{getServiceTypeLabel(st, lang)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* All Payments Table (when payments tab is active) */}
      {activeTab === 'payments' && isFinancial && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('billProvider', lang)}</TableHead>
                    <TableHead>{t('accountNumber', lang)}</TableHead>
                    <TableHead>{t('serviceType', lang)}</TableHead>
                    <TableHead>{t('paymentDate', lang)}</TableHead>
                    <TableHead>{t('amount', lang)}</TableHead>
                    <TableHead>{t('outstandingBefore', lang)}</TableHead>
                    <TableHead>{t('outstandingAfter', lang)}</TableHead>
                    <TableHead>{t('paymentMethod', lang)}</TableHead>
                    <TableHead>{t('reference', lang)}</TableHead>
                    <TableHead className="text-right">{t('category', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPayments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{payment.recurringBill?.providerName || '—'}</p>
                          {payment.recurringBill?.buildingName && (
                            <p className="text-xs text-muted-foreground">{payment.recurringBill.buildingName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{payment.recurringBill?.accountNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {getServiceTypeLabel(payment.recurringBill?.serviceType || '', lang)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell className="font-semibold text-sm text-emerald">{formatAED(payment.amount)}</TableCell>
                      <TableCell className="text-sm">{formatAED(payment.outstandingBefore)}</TableCell>
                      <TableCell className="text-sm">{formatAED(payment.outstandingAfter)}</TableCell>
                      <TableCell className="text-sm">{payment.paymentMethod || '—'}</TableCell>
                      <TableCell className="text-sm">{payment.reference || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditPayment(payment)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            title={t('editPayment', lang)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment)}
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                            title={t('deletePayment', lang)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {allPayments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t('noPayments', lang)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bills Table (hidden when payments tab is active) */}
      {activeTab !== 'payments' && (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('providerName', lang)}</TableHead>
                  <TableHead>{t('accountNumber', lang)}</TableHead>
                  <TableHead>{t('building', lang)}</TableHead>
                  {activeTab === 'paid' && <TableHead>{t('amountPaid', lang)}</TableHead>}
                  {activeTab === 'paid' && <TableHead>{t('paymentDate', lang)}</TableHead>}
                  {activeTab === 'paid' && <TableHead>{t('paymentReference', lang)}</TableHead>}
                  {activeTab === 'partially_paid' && <TableHead>{t('originalAmount', lang)}</TableHead>}
                  {activeTab === 'partially_paid' && <TableHead>{t('amountPaid', lang)}</TableHead>}
                  {activeTab === 'partially_paid' && <TableHead>{t('remainingBalance', lang)}</TableHead>}
                  {activeTab === 'overdue' && <TableHead>{t('daysOverdue', lang)}</TableHead>}
                  {activeTab === 'overdue' && <TableHead>{t('currentOutstanding', lang)}</TableHead>}
                  {activeTab === 'upcoming' && <TableHead>{t('daysRemaining', lang)}</TableHead>}
                  {activeTab === 'due_soon' && <TableHead>{t('daysRemaining', lang)}</TableHead>}
                  {activeTab === 'outstanding' && <TableHead>{t('previousBalance', lang)}</TableHead>}
                  {activeTab === 'outstanding' && <TableHead>{t('currentBalance', lang)}</TableHead>}
                  {!['paid', 'partially_paid', 'overdue', 'upcoming', 'due_soon', 'outstanding'].includes(activeTab) && (
                    <>
                      <TableHead>{t('currentOutstanding', lang)}</TableHead>
                    </>
                  )}
                  <TableHead>{t('nextDueDate', lang)}</TableHead>
                  <TableHead>{t('status', lang)}</TableHead>
                  <TableHead className="text-right">{t('category', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiltered.map(bill => {
                  const overdue = isOverdue(bill)
                  const overdueDays = overdue ? getOverdueDays(bill.nextDueDate) : 0
                  const daysRemaining = getDaysRemaining(bill.nextDueDate)
                  return (
                    <TableRow key={bill.id} className={overdue ? 'bg-red-50/50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{bill.providerName}</p>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {getServiceTypeLabel(bill.serviceType, lang)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{bill.accountNumber || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {bill.property ? getNameByLang(bill.property, lang) : bill.buildingName || '—'}
                      </TableCell>

                      {/* Context-specific columns */}
                      {activeTab === 'paid' && (
                        <>
                          <TableCell className="font-semibold text-sm text-emerald">
                            {displayAmount(bill.totalAmountDue)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {bill.lastPaymentDate ? formatDate(bill.lastPaymentDate) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">{bill.payments?.[0]?.reference || '—'}</TableCell>
                        </>
                      )}

                      {activeTab === 'partially_paid' && (
                        <>
                          <TableCell className="text-sm">{displayAmount(bill.totalAmountDue)}</TableCell>
                          <TableCell className="font-semibold text-sm text-emerald">
                            {displayAmount(bill.totalAmountDue - bill.currentOutstanding)}
                          </TableCell>
                          <TableCell className="font-semibold text-sm text-red-600">
                            {displayAmount(bill.currentOutstanding)}
                          </TableCell>
                        </>
                      )}

                      {activeTab === 'overdue' && (
                        <>
                          <TableCell>
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                              {overdueDays} {t('daysOverdue', lang)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-sm text-red-600">
                            {displayAmount(bill.currentOutstanding)}
                          </TableCell>
                        </>
                      )}

                      {activeTab === 'upcoming' && (
                        <>
                          <TableCell className="text-sm">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                              {daysRemaining} {t('daysRemaining', lang)}
                            </Badge>
                          </TableCell>
                        </>
                      )}

                      {activeTab === 'due_soon' && (
                        <TableCell className="text-sm">
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                            {daysRemaining} {t('daysRemaining', lang)}
                          </Badge>
                        </TableCell>
                      )}

                      {activeTab === 'outstanding' && (
                        <>
                          <TableCell className="text-sm">{displayAmount(bill.previousOutstanding)}</TableCell>
                          <TableCell className="font-semibold text-sm text-red-600">
                            {displayAmount(bill.currentOutstanding)}
                          </TableCell>
                        </>
                      )}

                      {!['paid', 'partially_paid', 'overdue', 'upcoming', 'due_soon', 'outstanding'].includes(activeTab) && (
                        <>
                          <TableCell className="font-semibold text-sm">
                            <span className={bill.currentOutstanding > 0 ? 'text-red-600' : 'text-emerald'}>
                              {displayAmount(bill.currentOutstanding)}
                            </span>
                          </TableCell>
                        </>
                      )}

                      <TableCell>
                        <div>
                          <p className="text-sm">{formatDate(bill.nextDueDate)}</p>
                          {overdue && (
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs mt-1">
                              {overdueDays} {t('daysOverdue', lang)}
                            </Badge>
                          )}
                          {isUpcoming(bill) && !overdue && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs mt-1">
                              {t('dueSoon', lang)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(bill.status)}
                          <span className="text-xs text-muted-foreground">
                            {getFrequencyLabel(bill.billingFrequency, lang)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openHistory(bill)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            title={t('paymentHistory', lang)}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openCyclesDialog(bill)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                            title={t('viewCycles', lang)}
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openPayment(bill)}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                            title={t('recordPayment', lang)}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                          {canModify && (
                            <>
                              <button
                                onClick={() => openEdit(bill)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {overdue && (
                                <button
                                  onClick={() => openNewCycleDialog(bill)}
                                  className="p-1.5 rounded hover:bg-amber-50 text-amber-600"
                                  title={t('advanceCycle', lang)}
                                >
                                  <FastForward className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(bill.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {sortedFiltered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {t('noData', lang)}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ─── Add/Edit Bill Dialog ─── */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editRecurringBill', lang) : t('addRecurringBill', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Property & Provider */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('selectProperty', lang)} *</Label>
                <Select value={billForm.propertyId} onValueChange={v => setBillForm({ ...billForm, propertyId: v })}>
                  <SelectTrigger><SelectValue placeholder={t('selectProperty', lang)} /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{getNameByLang(p, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('providerName', lang)} *</Label>
                <Input value={billForm.providerName} onChange={e => setBillForm({ ...billForm, providerName: e.target.value })} />
              </div>
            </div>

            {/* Service Type & Billing Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('serviceType', lang)} *</Label>
                <Select value={billForm.serviceType} onValueChange={v => setBillForm({ ...billForm, serviceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(st => (
                      <SelectItem key={st} value={st}>{getServiceTypeLabel(st, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('billingFrequency', lang)} *</Label>
                <Select value={billForm.billingFrequency} onValueChange={v => setBillForm({ ...billForm, billingFrequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_FREQUENCIES.map(f => (
                      <SelectItem key={f} value={f}>{getFrequencyLabel(f, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('accountNumber', lang)}</Label>
                <Input
                  value={billForm.accountNumber}
                  onChange={e => {
                    setBillForm({ ...billForm, accountNumber: e.target.value })
                    // Debounced duplicate check
                    if (accountCheckTimer.current) clearTimeout(accountCheckTimer.current)
                    const val = e.target.value.trim()
                    if (!val) {
                      setAccountNumberWarning(null)
                      return
                    }
                    setCheckingAccount(true)
                    accountCheckTimer.current = setTimeout(async () => {
                      try {
                        const res = await fetch(`/api/recurring-bills/check-account?accountNumber=${encodeURIComponent(val)}`)
                        if (res.ok) {
                          const data = await res.json()
                          const result = data.data || data
                          if (result.exists) {
                            const bills = result.bills || []
                            const existingInfo = bills
                              .filter((b: any) => b.id !== editing?.id)
                              .map((b: any) => `${b.providerName} (${b.propertyName || b.buildingName || 'N/A'})`)
                              .join(', ')
                            if (existingInfo) {
                              setAccountNumberWarning(`Already used by: ${existingInfo}`)
                            } else {
                              setAccountNumberWarning(null)
                            }
                          } else {
                            setAccountNumberWarning(null)
                          }
                        }
                      } catch {
                        // Silent fail — don't block user input
                      } finally {
                        setCheckingAccount(false)
                      }
                    }, 500)
                  }}
                />
                {checkingAccount && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                  </p>
                )}
                {accountNumberWarning && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {accountNumberWarning}
                  </p>
                )}
              </div>
              <div>
                <Label>{t('contractNumber', lang)}</Label>
                <Input value={billForm.contractNumber} onChange={e => setBillForm({ ...billForm, contractNumber: e.target.value })} />
              </div>
            </div>

            {/* Amount & Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('currentOutstanding', lang)} (AED)</Label>
                <Input type="number" value={billForm.currentOutstanding} onChange={e => setBillForm({ ...billForm, currentOutstanding: Number(e.target.value) })} />
              </div>
              <div>
                <Label>{t('nextDueDate', lang)} *</Label>
                <Input type="date" value={billForm.nextDueDate} onChange={e => setBillForm({ ...billForm, nextDueDate: e.target.value })} />
              </div>
            </div>

            {/* Auto Renew & Grace Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="autoRenew"
                  checked={billForm.autoRenew}
                  onCheckedChange={(checked) => setBillForm({ ...billForm, autoRenew: !!checked })}
                />
                <Label htmlFor="autoRenew" className="cursor-pointer">{t('autoRenew', lang)}</Label>
              </div>
              <div>
                <Label>{t('gracePeriod', lang)}</Label>
                <Input type="number" value={billForm.gracePeriodDays} onChange={e => setBillForm({ ...billForm, gracePeriodDays: Number(e.target.value) })} />
              </div>
            </div>

            {/* Building / Owner / Manager */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>{t('buildingName', lang)}</Label>
                <Input value={billForm.buildingName} onChange={e => setBillForm({ ...billForm, buildingName: e.target.value })} />
              </div>
              <div>
                <Label>{t('ownerName', lang)}</Label>
                <Input value={billForm.ownerName} onChange={e => setBillForm({ ...billForm, ownerName: e.target.value })} />
              </div>
              <div>
                <Label>{t('propertyManager', lang)}</Label>
                <Input value={billForm.propertyManager} onChange={e => setBillForm({ ...billForm, propertyManager: e.target.value })} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>{t('notes', lang)}</Label>
              <Textarea value={billForm.notes} onChange={e => setBillForm({ ...billForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleSaveBill}
              className="bg-emerald hover:bg-emerald/90 text-white"
              disabled={!billForm.propertyId || !billForm.providerName || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment Dialog ─── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('recordPayment', lang)}</DialogTitle>
          </DialogHeader>
          {payingBill && (
            <div className="space-y-4">
              {/* Bill info summary */}
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('providerName', lang)}</span>
                    <span className="font-medium">{payingBill.providerName}</span>
                  </div>
                  {payingBill.accountNumber && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('accountNumber', lang)}</span>
                      <span className="font-medium font-mono">{payingBill.accountNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">{getServiceTypeLabel(payingBill.serviceType, lang)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('currentOutstanding', lang)}</span>
                    <span className="font-medium text-red-600">{displayAmount(payingBill.currentOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('totalAmountDue', lang)}</span>
                    <span className="font-bold text-terracotta">{displayAmount(payingBill.totalAmountDue)}</span>
                  </div>
                </CardContent>
              </Card>
              {payingBill.cycles && payingBill.cycles.length > 0 && (
                <div>
                  <Label>{t('payAgainstCycle', lang)}</Label>
                  <Select value={selectedCycleId || '__auto__'} onValueChange={v => setSelectedCycleId(v === '__auto__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder={t('selectCycle', lang)} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">{t('currentCycle', lang)} ({t('cycleOutstanding', lang)}: {displayAmount(payingBill.cycles?.[0]?.outstandingAmount ?? payingBill.currentOutstanding)})</SelectItem>
                      {payingBill.cycles.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {formatDate(c.periodStart)} — {formatDate(c.periodEnd)} | {formatAED(c.outstandingAmount)} | {c.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>{t('paymentAmount', lang)} (AED) *</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t('paymentDate', lang)} *</Label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('paymentMethod', lang)}</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m} value={m}>
                        {m === 'cash' ? t('cash', lang) :
                         m === 'bank_transfer' ? t('bankTransfer', lang) :
                         m === 'cheque' ? t('cheque', lang) : 'Online'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('reference', lang)}</Label>
                <Input value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
              </div>
              <div>
                <Label>{t('notes', lang)}</Label>
                <Textarea value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleRecordPayment}
              className="bg-emerald hover:bg-emerald/90 text-white"
              disabled={paymentForm.amount <= 0 || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('confirmPayment', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Payment History Dialog ─── */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('paymentHistory', lang)} — {historyBill?.providerName}
            </DialogTitle>
          </DialogHeader>
          {historyBill && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">{getServiceTypeLabel(historyBill.serviceType, lang)}</Badge>
                  </div>
                  {historyBill.accountNumber && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('accountNumber', lang)}</span>
                      <span className="font-medium font-mono">{historyBill.accountNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('currentOutstanding', lang)}</span>
                    <span className="font-medium text-red-600">{displayAmount(historyBill.currentOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('totalAmountDue', lang)}</span>
                    <span className="font-bold text-terracotta">{displayAmount(historyBill.totalAmountDue)}</span>
                  </div>
                  {historyBill.lastPaymentDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('lastPaymentDate', lang)}</span>
                      <span className="font-medium">{formatDate(historyBill.lastPaymentDate)}</span>
                    </div>
                  )}
                  {historyBill.lastPaymentAmount !== null && historyBill.lastPaymentAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('lastPaymentAmount', lang)}</span>
                      <span className="font-medium text-emerald">{displayAmount(historyBill.lastPaymentAmount)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments list */}
              {payments.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">{t('noPayments', lang)}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('paymentDate', lang)}</TableHead>
                        <TableHead>{t('amount', lang)}</TableHead>
                        <TableHead>{t('outstandingBefore', lang)}</TableHead>
                        <TableHead>{t('outstandingAfter', lang)}</TableHead>
                        <TableHead>{t('paymentMethod', lang)}</TableHead>
                        <TableHead>{t('reference', lang)}</TableHead>
                        {isFinancial && <TableHead className="text-right">{t('category', lang)}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{formatDate(p.paymentDate)}</TableCell>
                          <TableCell className="font-semibold text-sm text-emerald">
                            {isFinancial ? formatAED(p.amount) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFinancial ? formatAED(p.outstandingBefore) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {isFinancial ? formatAED(p.outstandingAfter) : '***'}
                          </TableCell>
                          <TableCell className="text-sm">{p.paymentMethod || '—'}</TableCell>
                          <TableCell className="text-sm">{p.reference || '—'}</TableCell>
                          {isFinancial && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setHistoryDialogOpen(false); openEditPayment(p); }}
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                                  title={t('editPayment', lang)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setHistoryDialogOpen(false); handleDeletePayment(p); }}
                                  className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                                  title={t('deletePayment', lang)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Payment Dialog ─── */}
      <Dialog open={editPaymentDialogOpen} onOpenChange={setEditPaymentDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('editPayment', lang)}</DialogTitle>
          </DialogHeader>
          {editingPayment && (
            <div className="space-y-4">
              {/* Bill info summary */}
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('billProvider', lang)}</span>
                    <span className="font-medium">{editingPayment.recurringBill?.providerName || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">
                      {getServiceTypeLabel(editingPayment.recurringBill?.serviceType || '', lang)}
                    </Badge>
                  </div>
                  {editingPayment.billCycle && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('billingCycle', lang)}</span>
                      <span className="font-medium text-xs">
                        {formatDate(editingPayment.billCycle.periodStart)} — {formatDate(editingPayment.billCycle.periodEnd)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('originalAmount', lang)}</span>
                    <span className="font-medium">{formatAED(editingPayment.amount)}</span>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label>{t('paymentAmount', lang)} (AED) *</Label>
                <Input
                  type="number"
                  value={editPaymentForm.amount}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t('paymentDate', lang)} *</Label>
                <Input
                  type="date"
                  value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, paymentDate: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('paymentMethod', lang)}</Label>
                <Select value={editPaymentForm.paymentMethod} onValueChange={v => setEditPaymentForm({ ...editPaymentForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m} value={m}>
                        {m === 'cash' ? t('cash', lang) :
                         m === 'bank_transfer' ? t('bankTransfer', lang) :
                         m === 'cheque' ? t('cheque', lang) : 'Online'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('reference', lang)}</Label>
                <Input value={editPaymentForm.reference} onChange={e => setEditPaymentForm({ ...editPaymentForm, reference: e.target.value })} />
              </div>
              <div>
                <Label>{t('notes', lang)}</Label>
                <Textarea value={editPaymentForm.notes} onChange={e => setEditPaymentForm({ ...editPaymentForm, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPaymentDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleEditPayment}
              className="bg-emerald hover:bg-emerald/90 text-white"
              disabled={editPaymentForm.amount <= 0 || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Billing Cycles Dialog ─── */}
      <Dialog open={cyclesDialogOpen} onOpenChange={setCyclesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('billingCycles', lang)} — {cyclesBill?.providerName}
            </DialogTitle>
          </DialogHeader>
          {cyclesBill && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('serviceType', lang)}</span>
                    <Badge variant="secondary" className="text-xs">{getServiceTypeLabel(cyclesBill.serviceType, lang)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('totalCycles', lang)}</span>
                    <span className="font-medium">{billCycles.length}</span>
                  </div>
                </CardContent>
              </Card>

              {billCycles.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-sm">{t('noCycles', lang)}</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {billCycles.map((cycle, idx) => (
                    <Card key={cycle.id} className={idx === 0 && (cycle.status === 'pending' || cycle.status === 'partially_paid' || cycle.status === 'overdue') ? 'border-emerald-300 bg-emerald-50/50' : ''}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {idx === 0 && (cycle.status === 'pending' || cycle.status === 'partially_paid' || cycle.status === 'overdue') && (
                                <Badge className="bg-emerald-100 text-emerald-800 text-xs">{t('currentCycle', lang)}</Badge>
                              )}
                              {idx > 0 && (
                                <Badge variant="secondary" className="text-xs">{t('previousCycles', lang)}</Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">
                              {formatDate(cycle.periodStart)} — {formatDate(cycle.periodEnd)}
                            </p>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{t('cycleAmount', lang)}: <span className="font-semibold text-foreground">{displayAmount(cycle.amount)}</span></span>
                              <span>{t('cyclePaid', lang)}: <span className="font-semibold text-emerald">{displayAmount(cycle.paidAmount)}</span></span>
                              <span>{t('cycleOutstanding', lang)}: <span className={cycle.outstandingAmount > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald'}>{displayAmount(cycle.outstandingAmount)}</span></span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className={
                              cycle.status === 'paid' ? 'bg-emerald-100 text-emerald-800 text-xs' :
                              cycle.status === 'overdue' ? 'bg-red-100 text-red-800 text-xs' :
                              cycle.status === 'partially_paid' ? 'bg-amber-100 text-amber-800 text-xs' :
                              'bg-gray-100 text-gray-800 text-xs'
                            }>
                              {cycle.status.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{t('dueDate', lang) || 'Due'}: {formatDate(cycle.dueDate)}</span>
                            {cycle._count && (
                              <span className="text-xs text-muted-foreground">{cycle._count.payments} payment{cycle._count.payments !== 1 ? 's' : ''}</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Advance Cycle Dialog ─── */}
      <Dialog open={newCycleDialogOpen} onOpenChange={setNewCycleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('advanceCycle', lang)}</DialogTitle>
          </DialogHeader>
          {newCycleBill && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('providerName', lang)}</span>
                    <span className="font-medium">{newCycleBill.providerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('currentOutstanding', lang)}</span>
                    <span className="font-medium text-red-600">{displayAmount(newCycleBill.currentOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('billingFrequency', lang)}</span>
                    <span className="font-medium">{getFrequencyLabel(newCycleBill.billingFrequency, lang)}</span>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label>{t('newCycleAmount', lang)} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newCycleAmount}
                  onChange={e => setNewCycleAmount(Number(e.target.value))}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This will close the current cycle and create a new billing period with this amount.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCycleDialogOpen(false)}>{t('cancel', lang)}</Button>
            <Button
              onClick={handleAdvanceCycle}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              disabled={newCycleAmount < 0 || saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <FastForward className="w-4 h-4 mr-2" />
              {t('createCycle', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
